// Anonymous Community v1 database migration (Phase 1 part).
//
// Modes in this phase:
//   node migrations/community-v1.mjs --report
//       Read-only (the default). Prints counts and index names, never content,
//       connection strings or other values.
//   node migrations/community-v1.mjs --create-indexes --backup-dir <path>
//       Creates the community indexes with createIndex only. Never drops or
//       changes an existing index; conflicts are reported and skipped.
//
// "--apply" (legacy backfill with screening and the comment copy) is added in a
// later phase, after content screening is complete.
//
// Safety rules:
// - Refuses any database host other than localhost unless --allow-remote-host
//   is given. Live or staging migrations are run by the project owner only,
//   after a full backup; this tool is never pointed at them by Claude.
// - --create-indexes requires --backup-dir pointing at a mongodump output, less
//   than 24 hours old, that contains every listed collection that exists.
// - Nothing is ever dropped. Suggested clean-ups are printed for human review.
//
// Reads MONGODB_URI (or the legacy MOGODB_URL) from the environment / backend/.env.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const BACKUP_COLLECTIONS = [
  'anonymousposts',
  'communitycomments',
  'communityreactions',
  'communityreports',
  'moderators',
  'moderationactions',
];
export const BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export const INDEX_PLAN = [
  {
    collection: 'anonymousposts',
    key: { publicId: 1 },
    options: { name: 'publicId_unique', unique: true, partialFilterExpression: { publicId: { $type: 'string' } } },
  },
  {
    collection: 'anonymousposts',
    key: { postId: 1 },
    options: { name: 'postId_unique', unique: true },
  },
];

// Returns the host names in a MongoDB connection string (without credentials or
// ports). mongodb+srv URIs resolve through DNS, so they are treated as remote.
export const parseMongoHosts = (uri) => {
  if (typeof uri !== 'string') return { srv: false, hosts: [] };
  const match = /^mongodb(\+srv)?:\/\/([^/?#]*)/i.exec(uri.trim());
  if (!match) return { srv: false, hosts: [] };
  const authority = match[2].includes('@') ? match[2].slice(match[2].lastIndexOf('@') + 1) : match[2];
  const hosts = authority.split(',').filter(Boolean).map((h) => {
    if (h.startsWith('[')) return h.slice(1, h.indexOf(']')).toLowerCase();
    return h.split(':')[0].toLowerCase();
  });
  return { srv: Boolean(match[1]), hosts };
};

export const isLocalOnlyUri = (uri) => {
  const { srv, hosts } = parseMongoHosts(uri);
  return !srv && hosts.length > 0 && hosts.every((h) => LOCAL_HOSTS.has(h));
};

// Checks a mongodump output folder. Accepts either the --out folder (with a
// <dbName> sub-folder) or the <dbName> folder itself. Returns a list of problems.
export const checkBackupDir = ({ dir, dbName, existingCollections, now = Date.now(), maxAgeMs = BACKUP_MAX_AGE_MS }) => {
  if (!dir) return ['--backup-dir is required for this mode'];
  const candidates = [path.join(dir, dbName), dir];
  const base = candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isDirectory());
  if (!base) return ['backup folder not found'];
  const problems = [];
  for (const name of BACKUP_COLLECTIONS.filter((c) => existingCollections.includes(c))) {
    for (const file of [`${name}.bson`, `${name}.metadata.json`]) {
      const full = path.join(base, file);
      if (!fs.existsSync(full)) {
        problems.push(`backup is missing ${file}`);
      } else if (now - fs.statSync(full).mtimeMs > maxAgeMs) {
        problems.push(`backup file ${file} is older than 24 hours`);
      }
    }
  }
  return problems;
};

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Decides what to do with each planned index given the existing ones.
export const planIndexes = (existingByCollection) => INDEX_PLAN.map((planned) => {
  const existing = (existingByCollection[planned.collection] || []).find((ix) => sameKey(ix.key, planned.key));
  if (!existing) return { ...planned, action: 'create' };
  const equivalent = Boolean(existing.unique) === Boolean(planned.options.unique)
    && JSON.stringify(existing.partialFilterExpression || null)
      === JSON.stringify(planned.options.partialFilterExpression || null);
  return { ...planned, action: equivalent ? 'present' : 'conflict', existingName: existing.name };
});

const parseArgs = (argv) => {
  const args = { mode: 'report', backupDir: null, allowRemote: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--report') args.mode = 'report';
    else if (arg === '--create-indexes') args.mode = 'create-indexes';
    else if (arg === '--backup-dir') { args.backupDir = argv[i + 1]; i += 1; }
    else if (arg === '--allow-remote-host') args.allowRemote = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
};

const describeIndex = (ix) => `${ix.name} ${JSON.stringify(ix.key)}${ix.unique ? ' unique' : ''}${ix.partialFilterExpression ? ' partial' : ''}`;

const report = async (db, existingCollections) => {
  console.log('Collections present:', BACKUP_COLLECTIONS.filter((c) => existingCollections.includes(c)).join(', ') || '(none)');
  if (!existingCollections.includes('anonymousposts')) {
    console.log('anonymousposts does not exist yet.');
    return {};
  }
  const posts = db.collection('anonymousposts');
  const counts = {
    total: await posts.countDocuments({}),
    withoutPublicId: await posts.countDocuments({ publicId: { $exists: false } }),
    unscreened: await posts.countDocuments({ $or: [{ screeningVersion: { $exists: false } }, { screeningVersion: { $lt: 1 } }] }),
    visible: await posts.countDocuments({ status: 'visible' }),
    pendingReview: await posts.countDocuments({ status: 'pending_review' }),
    hidden: await posts.countDocuments({ status: 'hidden' }),
    removed: await posts.countDocuments({ status: 'removed' }),
    withoutStatus: await posts.countDocuments({ status: { $exists: false } }),
    withEmbeddedComments: await posts.countDocuments({ 'comments.0': { $exists: true } }),
    withImageUrl: await posts.countDocuments({ imageUrl: { $type: 'string' } }),
  };
  console.log('anonymousposts counts:', JSON.stringify(counts));
  const indexes = await posts.indexes();
  console.log('anonymousposts indexes:');
  for (const ix of indexes) console.log(`  - ${describeIndex(ix)}`);
  const textIndexes = indexes.filter((ix) => Object.values(ix.key).includes('text'));
  if (textIndexes.length) {
    console.log('For human review later (NOT dropped by this script): text indexes are unused by the community search:');
    for (const ix of textIndexes) console.log(`  db.anonymousposts.dropIndex("${ix.name}")  // review before running`);
  }
  return { anonymousposts: indexes };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  await import('dotenv/config');
  const { getMongoUri } = await import('../config/env.js');
  const uri = getMongoUri();
  if (!uri) throw new Error('MONGODB_URI is not set');
  if (!isLocalOnlyUri(uri)) {
    if (!args.allowRemote) throw new Error('Refusing a non-local database host. This tool is for local databases unless --allow-remote-host is given by the project owner.');
    console.warn('WARNING: --allow-remote-host given. Make sure a complete, verified backup exists.');
  }

  const { default: mongoose } = await import('mongoose');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000 });
  try {
    const { db } = mongoose.connection;
    const existingCollections = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
    console.log(`Database: ${db.databaseName}  Mode: ${args.mode}`);
    const existing = await report(db, existingCollections);

    if (args.mode === 'create-indexes') {
      const problems = checkBackupDir({ dir: args.backupDir, dbName: db.databaseName, existingCollections });
      if (problems.length) throw new Error(`Backup check failed: ${problems.join('; ')}`);
      for (const step of planIndexes(existing)) {
        if (step.action === 'create') {
          await db.collection(step.collection).createIndex(step.key, step.options);
          console.log(`Created ${step.collection}.${step.options.name}`);
        } else if (step.action === 'present') {
          console.log(`Already present: ${step.collection}.${step.existingName} (no change)`);
        } else {
          console.log(`CONFLICT (skipped, nothing changed): ${step.collection}.${step.existingName} has the same key with different options; review by hand.`);
        }
      }
    }
  } finally {
    await mongoose.disconnect();
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Migration stopped: ${error.message}`);
    process.exitCode = 1;
  });
}
