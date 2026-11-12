// In-memory fake for the MongoDB collection methods Mongoose calls, for offline
// checks. MongoDB is never contacted. Based on the fake in
// security.offline-check.mjs (which keeps its own copy, unchanged), plus:
//
// - Unique-index simulation on insert: configured fields throw an error shaped
//   like the driver's duplicate-key error ({ code: 11000, keyPattern, keyValue }).
//   Documents missing the field are skipped, matching a partial unique index.
// - Unfiltered deletes are refused, as in the original.
//
// Only test data should ever be placed in these stores.
import mongoose from 'mongoose';

const isObjectId = (v) => v instanceof mongoose.Types.ObjectId;
const isPlainObject = (v) => v !== null && typeof v === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(v));
export const clone = (v) => {
  if (Array.isArray(v)) return v.map(clone);
  if (v instanceof Date) return new Date(v.getTime());
  if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]));
  return v;
};
export const sameValue = (a, b) => {
  if (isObjectId(a) || isObjectId(b)) return a != null && b != null && String(a) === String(b);
  if (a instanceof Date || b instanceof Date) return a != null && b != null && new Date(a).getTime() === new Date(b).getTime();
  return a === b;
};
const numeric = (v) => (v instanceof Date ? v.getTime() : v);
const getPath = (doc, path) => path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), doc);
const setPath = (doc, path, value) => {
  const keys = path.split('.');
  let target = doc;
  for (const key of keys.slice(0, -1)) target = target[key] ??= {};
  target[keys.at(-1)] = value;
};
const isOperatorObject = (v) => isPlainObject(v) && Object.keys(v).length > 0 && Object.keys(v).every((k) => k.startsWith('$'));

const fieldMatches = (value, cond) => {
  if (cond instanceof RegExp) return [].concat(value ?? []).some((v) => typeof v === 'string' && cond.test(v));
  if (isOperatorObject(cond)) {
    return Object.entries(cond).every(([op, arg]) => {
      switch (op) {
        case '$eq': return fieldMatches(value, arg);
        case '$ne': return !fieldMatches(value, arg);
        case '$in': return arg.some((a) => fieldMatches(value, a));
        case '$nin': return !arg.some((a) => fieldMatches(value, a));
        case '$gt': return value != null && numeric(value) > numeric(arg);
        case '$gte': return value != null && numeric(value) >= numeric(arg);
        case '$lt': return value != null && numeric(value) < numeric(arg);
        case '$lte': return value != null && numeric(value) <= numeric(arg);
        case '$exists': return (value !== undefined) === Boolean(arg);
        case '$regex': return fieldMatches(value, arg instanceof RegExp ? arg : new RegExp(arg, cond.$options || ''));
        case '$options': return true;
        default: throw new Error(`Fake collection does not support ${op}`);
      }
    });
  }
  if (Array.isArray(value) && !Array.isArray(cond)) return value.some((v) => sameValue(v, cond));
  return sameValue(value, cond);
};
const matches = (doc, filter = {}) => Object.entries(filter).every(([key, cond]) => {
  if (key === '$or') return cond.some((f) => matches(doc, f));
  if (key === '$and') return cond.every((f) => matches(doc, f));
  if (key.startsWith('$')) throw new Error(`Fake collection does not support ${key}`);
  return fieldMatches(getPath(doc, key), cond);
});
const project = (doc, projection) => {
  const entries = Object.entries(projection || {});
  if (entries.length === 0) return clone(doc);
  const inclusive = entries.some(([k, v]) => k !== '_id' && v) || entries.every(([, v]) => v);
  if (inclusive) {
    const out = {};
    if (projection._id !== 0 && projection._id !== false) out._id = doc._id;
    for (const [k, v] of entries) if (v && k !== '_id' && doc[k] !== undefined) out[k] = clone(doc[k]);
    return out;
  }
  const out = clone(doc);
  for (const [k, v] of entries) if (!v) delete out[k];
  return out;
};
const sortDocs = (docs, sort) => {
  if (!sort) return docs;
  const keys = Object.entries(sort).map(([k, d]) => [k, d === -1 || d === 'desc' || d === 'descending' ? -1 : 1]);
  return [...docs].sort((a, b) => {
    for (const [key, dir] of keys) {
      const av = getPath(a, key);
      const bv = getPath(b, key);
      if (av == null && bv == null) continue;
      if (av == null) return -dir;
      if (bv == null) return dir;
      const diff = typeof numeric(av) === 'number' ? numeric(av) - numeric(bv) : String(av).localeCompare(String(bv));
      if (diff !== 0) return diff * dir;
    }
    return 0;
  });
};
const applyUpdate = (doc, update) => {
  for (const [op, fields] of Object.entries(update)) {
    for (const [path, arg] of Object.entries(fields)) {
      const list = () => getPath(doc, path) || [];
      switch (op) {
        case '$set': setPath(doc, path, clone(arg)); break;
        case '$unset': setPath(doc, path, undefined); break;
        case '$inc': setPath(doc, path, (getPath(doc, path) || 0) + arg); break;
        case '$push':
        case '$addToSet': {
          const items = isPlainObject(arg) && Array.isArray(arg.$each) ? arg.$each : [arg];
          const next = list();
          for (const item of items) if (op === '$push' || !next.some((v) => sameValue(v, item))) next.push(clone(item));
          setPath(doc, path, next);
          break;
        }
        case '$pull':
          setPath(doc, path, list().filter((v) => !(isOperatorObject(arg) ? fieldMatches(v, arg) : sameValue(v, arg))));
          break;
        case '$setOnInsert': break;
        default: throw new Error(`Fake collection does not support ${op}`);
      }
    }
  }
};
const requireFilter = (filter, method) => {
  if (!filter || Object.keys(filter).length === 0) throw new Error(`Refusing an unfiltered ${method} in the fake database`);
};

const duplicateKeyError = (field, value) => Object.assign(
  new Error(`E11000 duplicate key error (fake): ${field}`),
  { name: 'MongoServerError', code: 11000, keyPattern: { [field]: 1 }, keyValue: { [field]: value } },
);

// unique: { [collectionName]: ['field', ...] }
export const createFakeDatabase = ({ unique = {} } = {}) => {
  const stores = new Map();
  const counters = { insertAttempts: new Map() };

  const fakeCollection = (name) => {
    if (!stores.has(name)) stores.set(name, []);
    const docs = () => stores.get(name);
    const uniqueFields = unique[name] || [];
    const select = (filter, options = {}) => {
      let found = sortDocs(docs().filter((d) => matches(d, filter)), options.sort);
      if (options.skip) found = found.slice(options.skip);
      if (options.limit) found = found.slice(0, options.limit);
      return found.map((d) => project(d, options.projection));
    };
    return {
      find: async (filter, options) => ({ toArray: async () => select(filter, options) }),
      findOne: async (filter, options) => select(filter, { ...options, limit: 1 })[0] ?? null,
      countDocuments: async (filter) => docs().filter((d) => matches(d, filter)).length,
      insertOne: async (doc) => {
        counters.insertAttempts.set(name, (counters.insertAttempts.get(name) || 0) + 1);
        for (const field of uniqueFields) {
          const value = getPath(doc, field);
          if (value !== undefined && value !== null && docs().some((d) => sameValue(getPath(d, field), value))) {
            throw duplicateKeyError(field, value);
          }
        }
        docs().push(clone(doc));
        return { acknowledged: true, insertedId: doc._id };
      },
      updateOne: async (filter, update) => {
        const doc = docs().find((d) => matches(d, filter));
        if (doc) applyUpdate(doc, update);
        return { acknowledged: true, matchedCount: doc ? 1 : 0, modifiedCount: doc ? 1 : 0, upsertedCount: 0 };
      },
      deleteOne: async (filter) => {
        requireFilter(filter, 'deleteOne');
        const index = docs().findIndex((d) => matches(d, filter));
        if (index >= 0) docs().splice(index, 1);
        return { acknowledged: true, deletedCount: index >= 0 ? 1 : 0 };
      },
      deleteMany: async (filter) => {
        requireFilter(filter, 'deleteMany');
        const before = docs().length;
        stores.set(name, docs().filter((d) => !matches(d, filter)));
        return { acknowledged: true, deletedCount: before - docs().length };
      },
    };
  };

  // Replaces the collection methods of every registered model.
  const install = () => {
    const patched = new Set();
    for (const modelName of mongoose.modelNames()) {
      const { collection } = mongoose.model(modelName);
      if (patched.has(collection)) continue;
      Object.assign(collection, fakeCollection(collection.collectionName));
      patched.add(collection);
    }
  };

  const store = (model) => {
    const name = model.collection.collectionName;
    if (!stores.has(name)) stores.set(name, []);
    return stores.get(name);
  };

  return { install, store, counters };
};
