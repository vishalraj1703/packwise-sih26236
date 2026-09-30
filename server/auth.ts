import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { get, run } from "./db";

export type Role = "producer" | "transporter" | "retailer" | "expert" | "admin";
export interface User { id: number; email: string; name: string; role: Role; org: string | null }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: User } }
}

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, salt: string, hash: string) {
  const h = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return h.length === expected.length && crypto.timingSafeEqual(h, expected);
}

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", sha256(token), userId, expires);
  return { token, expires };
}

export function destroySession(token: string) {
  run("DELETE FROM sessions WHERE token = ?", sha256(token));
}

function readToken(req: Request): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) return h.slice(7);
  const cookie = req.headers.cookie?.split(";").map((c) => c.trim()).find((c) => c.startsWith("pw_session="));
  return cookie ? decodeURIComponent(cookie.slice("pw_session=".length)) : null;
}

/** Attaches req.user when a valid session exists; never rejects. */
export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = readToken(req);
  if (token) {
    const row = get(
      "SELECT u.id, u.email, u.name, u.role, u.org FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?",
      sha256(token), new Date().toISOString()
    );
    if (row) req.user = row as User;
  }
  next();
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Sign in required" });
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Sign in required" });
    if (!roles.includes(req.user.role) && req.user.role !== "admin") return res.status(403).json({ error: `This action needs one of these roles: ${roles.join(", ")}` });
    next();
  };
}

/** Retailer POS integration: `X-API-Key` header mapped to a retailer account. */
export function userFromApiKey(key: string | undefined): User | null {
  if (!key) return null;
  const row = get("SELECT id, email, name, role, org FROM users WHERE api_key_hash = ?", sha256(key));
  return (row as User) ?? null;
}
