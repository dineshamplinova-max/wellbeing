// The only user fields that API responses may contain. Anything else on the
// document (password hash, internal fields, future role flags) is dropped.
const SAFE_USER_FIELDS = ['_id', 'username', 'name', 'email', 'gender', 'age', 'bio', 'profilePicture', 'createdAt', 'updatedAt'];

export const toSafeUser = (user) => {
  if (!user) return null;
  const source = typeof user.toObject === 'function' ? user.toObject() : user;
  const safe = {};
  for (const field of SAFE_USER_FIELDS) {
    if (source[field] !== undefined) safe[field] = source[field];
  }
  return safe;
};
