import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';
import { HttpError } from './lib/util.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, name: user.name }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export async function loadUser(id) {
  const { rows } = await query(
    `SELECT u.id, u.name, u.username, u.active, u.role_id, r.name AS role, r.permissions
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [id],
  );
  return rows[0] || null;
}

/** Express middleware: requires a valid Bearer token and an active user. Sets req.user (with permissions). */
export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Not signed in');
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new HttpError(401, 'Session expired, please sign in again');
  }
  const user = await loadUser(payload.sub);
  if (!user || !user.active) throw new HttpError(401, 'Account disabled');
  req.user = user;
  next();
}

export const hasPerm = (user, perm) => !!user?.permissions?.includes(perm);

/** Require at least one of the given permissions. */
export const requirePerm = (...perms) => (req, _res, next) => {
  if (!perms.some((p) => hasPerm(req.user, p))) throw new HttpError(403, 'You do not have permission to do this');
  next();
};
