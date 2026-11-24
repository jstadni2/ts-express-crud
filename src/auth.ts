import type { Request } from "express";
import crypto from "node:crypto";

export const AUTH_SESSION_KEY = "user";
export const AUTH_ID_TOKEN_KEY = "oidc_id_token";
export const AUTH_RETURN_TO_KEY = "post_login_redirect";

// Session exemption list is applied by name. The static assets are excluded.
export const AUTH_EXEMPT_PATHS = new Set<string>(["/login", "/auth/callback", "/logout"]);

export type SessionUser = {
  netid: string;
  roles: string[];
  role: string | null;
};

const VALID_ROLES = new Set(["admin", "maintainer", "viewer", "developer"]);

/** Normalize a raw role value to a canonical lowercase role or null. */
export function normalizeRoleName(raw: string | undefined | null): string | null {
  if (raw === null || raw === undefined) return null;
  const role = String(raw).trim().toLowerCase();
  return VALID_ROLES.has(role) ? role : null;
}

/** Extract, dedupe and order roles from a session user dict. */
export function sessionUserRoles(user: SessionUser | null | undefined): string[] {
  if (!user || typeof user !== "object") return [];

  const rawRoles = Array.isArray(user.roles) ? user.roles : user.roles ? [user.roles as string] : [];
  const roles: string[] = [];
  const seen = new Set<string>();

  for (const raw of rawRoles as unknown[]) {
    const normalized = normalizeRoleName(raw as string);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      roles.push(normalized);
    }
  }

  const activeRole = normalizeRoleName(user.role);
  if (activeRole && !seen.has(activeRole)) {
    seen.add(activeRole);
    roles.push(activeRole);
  }

  if (roles.includes("developer")) {
    const dev = roles.filter((r) => r !== "developer");
    roles.splice(0, roles.length, ...dev, "developer");
  }

  return roles;
}

/** Return the user's most privileged role (admin > maintainer > viewer). */
export function activeSessionRole(user: SessionUser | null | undefined): string | null {
  const roles = sessionUserRoles(user);
  for (const role of ["admin", "maintainer", "viewer"]) {
    if (roles.includes(role)) return role;
  }
  return null;
}

export function currentUser(req: Request): SessionUser | null {
  const user = (req.session as any)[AUTH_SESSION_KEY];
  return user && typeof user === "object" ? (user as SessionUser) : null;
}

export function isAuthenticated(req: Request): boolean {
  return currentUser(req) !== null;
}

export function currentUserRole(req: Request): string | null {
  return activeSessionRole(currentUser(req));
}

export function isSafeRedirectTarget(target: string | undefined | null, req: Request): boolean {
  if (!target) return false;
  if (target.startsWith("//")) return false;
  try {
    const parsed = new URL(target, "http://local.invalid");
    if (parsed.hostname === "local.invalid") {
      // relative URL
      return target.startsWith("/");
    }
    const host = req.get("host") || "";
    const hostname = host.split(":")[0];
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname === hostname
    );
  } catch {
    return false;
  }
}

/** Parse AUTHMAN_ROLES env JSON into a Map<rolename, memberof-value>. */
export function authmanRoleMap(): Map<string, string> {
  const mapping: Record<string, unknown> = {};
  try {
    Object.assign(mapping, JSON.parse(process.env.AUTHMAN_ROLES || "{}"));
  } catch {
    return new Map();
  }
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(mapping)) {
    const k = key.trim().toLowerCase();
    if (k) result.set(k, String(value).trim());
  }
  return result;
}

/**
 * Map a user's `uiucedu_is_member_of` values to roles using the configured
 * AUTHMAN_ROLES mapping. Roles are returned in mapping (hierarchy) order.
 */
export function userRolesFromMemberOf(rawMembership: unknown): string[] {
  if (rawMembership === null || rawMembership === undefined) return [];

  const values: string[] = [];
  if (typeof rawMembership === "string") {
    values.push(rawMembership);
  } else if (Array.isArray(rawMembership)) {
    values.push(...(rawMembership as string[]).map(String));
  } else {
    values.push(String(rawMembership));
  }

  const memberValues = new Set(values.map((v) => v.trim()).filter(Boolean));
  const map = authmanRoleMap();
  const roles: string[] = [];
  for (const [roleName, mappedValue] of map.entries()) {
    if (memberValues.has(mappedValue)) {
      roles.push(roleName);
    }
  }
  return roles.sort((a, b) => {
    const keys = [...map.keys()];
    return keys.indexOf(a) - keys.indexOf(b);
  });
}

/** Generate a cryptographically-random secret key (used for dev fallback). */
export function randomSecretKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ---------------------------------------------------------------------------
// Auth backend protocol

import type { Response } from "express";

/**
 * Authentication backend used by the application. `login` and
 * `authCallback` are expected to short-circuit the request (redirect or
 * render). `logoutRedirectUrl` returns an IdP logout URL or null for
 * local-only logout.
 */
export interface AuthBackend {
  login(req: Request, res: Response): void;
  authCallback(req: Request, res: Response): void;
  logoutRedirectUrl(): string | null;
}

/** Check whether OIDC is configured with a client id/secret. */
export function isOidcConfigured(): boolean {
  return Boolean(
    process.env.SHIBBOLETH_CLIENT_ID && process.env.SHIBBOLETH_CLIENT_SECRET,
  );
}