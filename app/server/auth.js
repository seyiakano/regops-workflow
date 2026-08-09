import crypto from "node:crypto";
import { db } from "./db.js";

// Real (if lightweight) server-side sessions — a step up from the earlier
// "client just remembers the user object" prototype auth. Token is an opaque
// random string, not a JWT — nothing to decode, the DB row is the source of
// truth, so revocation (logout) is an actual DELETE, not just "forget it
// client-side". No refresh flow: a session simply expires and the user logs
// in again. That's a deliberate simplicity choice for an internal tool, not
// an oversight — flag it if this ever needs to survive a real security review.
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);
  db.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    token,
    userId,
    createdAt.toISOString(),
    expiresAt.toISOString()
  );
  return token;
}

export function destroySession(token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function getSessionUser(token) {
  if (!token) return null;
  const session = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token); // lazy cleanup of expired sessions
    return null;
  }
  return db.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id) ?? null;
}

function tokenFromRequest(req) {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

export function requireAuth(req, res, next) {
  const token = tokenFromRequest(req);
  const user = getSessionUser(token);
  if (!user) return res.status(401).json({ error: "Not authenticated — please sign in again." });
  req.user = user;
  req.sessionToken = token;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: "This action is restricted to admins." });
  }
  next();
}
