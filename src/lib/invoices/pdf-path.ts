/**
 * Ownership rule for objects in the private `invoice-pdfs` bucket.
 *
 * Paths are `{userId}/{timestamp}-{filename}` and the storage RLS policies key on
 * `(storage.foldername(name))[1] = auth.uid()`. That protects reads made through a
 * user-scoped client — but the reminder worker downloads through the service-role
 * client, which bypasses RLS entirely. So every path that reaches the database must
 * be checked in application code, at every write, or one user can point an invoice at
 * another user's file and have the worker mail it out.
 */

/** True when `path` lives directly under this user's folder in the bucket. */
export function isPathOwnedBy(path: string | null | undefined, userId: string): boolean {
  if (!path || !userId) return false;

  // Reject traversal and absolute paths outright rather than trying to normalize them.
  if (path.includes("..") || path.startsWith("/") || path.includes("\\")) return false;

  const slash = path.indexOf("/");
  if (slash <= 0) return false;

  // Compare the whole first segment. A `startsWith(userId + "/")` check would be
  // equivalent here, but comparing segments makes the prefix-confusion case
  // ("user1abc/…" must not pass for "user1") impossible to reintroduce.
  const owner = path.slice(0, slash);
  const rest = path.slice(slash + 1);
  if (owner !== userId) return false;

  // Something must actually follow the folder, and it must not be a nested traversal.
  return rest.length > 0 && !rest.startsWith("/");
}
