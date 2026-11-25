import type { Request, Response } from "express";

export const AUTH_SESSION_KEY = "user";
export const AUTH_ID_TOKEN_KEY = "oidc_id_token";
export const AUTH_RETURN_TO_KEY = "post_login_redirect";

/** Routes that never require an authenticated session. */
export const AUTH_EXEMPT_PATHS: ReadonlySet<string> = new Set([
  "/login",
  "/auth/callback",
  "/logout",
]);

export interface SessionUser {
  netid: string;
  roles?: unknown;
  role?: unknown;
}

export interface AuthCallbackResult {
  sessionUser: SessionUser;
  idToken: string;
}

/**
 * Port of the `AuthBackend` protocol from `src/app.py`. Implementations start
 * login, complete the OIDC callback, and resolve the IdP logout URL.
 */
export interface AuthBackend {
  /** Start authentication and send the redirect (or error) response. */
  login(req: Request, res: Response): void | Promise<void>;
  /** Handle the callback and return the session user and ID token. */
  authCallback(req: Request, res: Response): Promise<AuthCallbackResult> | AuthCallbackResult;
  /** Return an IdP logout URL, or null for local-only logout. */
  logoutRedirectUrl(req: Request): string | null;
}

export function normalizeRoleName(rawValue: unknown): string | null {
  if (rawValue === null || rawValue === undefined) return null;
  const roleName = String(rawValue).trim().toLowerCase();
  if (["admin", "maintainer", "viewer", "developer"].includes(roleName)) {
    return roleName;
  }
  return null;
}

/** Port of `_session_user_roles`: normalize, dedupe, developer last. */
export function sessionUserRoles(sessionUser: SessionUser | null): string[] {
  if (!sessionUser || typeof sessionUser !== "object") return [];

  let rawRoles: unknown = sessionUser.roles ?? [];
  if (typeof rawRoles === "string") rawRoles = [rawRoles];

  const roles: string[] = [];
  const seen = new Set<string>();
  for (const rawRole of Array.isArray(rawRoles) ? rawRoles : []) {
    const normalized = normalizeRoleName(rawRole);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      roles.push(normalized);
    }
  }

  const activeRole = normalizeRoleName(sessionUser.role);
  if (activeRole && !seen.has(activeRole)) {
    roles.push(activeRole);
  }

  if (roles.includes("developer")) {
    return roles.filter((role) => role !== "developer").concat(["developer"]);
  }

  return roles;
}

/** Port of `_active_session_role`: the user's most privileged role. */
export function activeSessionRole(sessionUser: SessionUser | null): string | null {
  for (const role of ["admin", "maintainer", "viewer"]) {
    if (sessionUserRoles(sessionUser).includes(role)) {
      return role;
    }
  }
  return null;
}

export function currentUser(req: Request): SessionUser | null {
  const user = req.session?.[AUTH_SESSION_KEY];
  return user && typeof user === "object" ? (user as SessionUser) : null;
}

export function isAuthenticated(req: Request): boolean {
  return currentUser(req) !== null;
}

export function currentUserRole(req: Request): string | null {
  return activeSessionRole(currentUser(req));
}

/** Port of `_authman_role_map` (ordered entries, keys lowered, values trimmed). */
export function authmanRoleEntries(): Array<[roleName: string, mappedValue: string]> {
  let mapping: unknown;
  try {
    mapping = JSON.parse(process.env.AUTHMAN_ROLES ?? "{}");
  } catch {
    return [];
  }
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) return [];

  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(mapping as Record<string, unknown>)) {
    if (!key || typeof value !== "string") continue;
    const roleName = key.trim().toLowerCase();
    const mappedValue = value.trim();
    if (roleName && mappedValue) entries.push([roleName, mappedValue]);
  }
  return entries;
}

/**
 * Port of `_user_roles_from_member_of`: map AuthMan membership values onto
 * application roles, preserving the AUTHMAN_ROLES hierarchy order.
 */
export function userRolesFromMemberOf(rawMembership: unknown): string[] {
  if (rawMembership === null || rawMembership === undefined) return [];

  let values: unknown[];
  if (typeof rawMembership === "string") values = [rawMembership];
  else if (Array.isArray(rawMembership)) values = rawMembership;
  else values = [String(rawMembership)];

  const memberValues = new Set(
    values.map((value) => String(value).trim()).filter((value) => value !== ""),
  );

  const roles: string[] = [];
  for (const [roleName, mappedValue] of authmanRoleEntries()) {
    if (memberValues.has(mappedValue)) roles.push(roleName);
  }
  return roles;
}

// ---------------------------------------------------------------------------
// Post-login redirect handling (port of `_is_safe_redirect_target` etc.)
// ---------------------------------------------------------------------------

interface ParsedTarget {
  scheme: string;
  netloc: string;
  path: string;
}

/** Minimal URL split mirroring Python's `urllib.parse.urlparse`. */
function parseTarget(target: string): ParsedTarget {
  let rest = target;
  let scheme = "";
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(rest);
  if (schemeMatch) {
    scheme = schemeMatch[1];
    rest = rest.slice(schemeMatch[0].length);
  }

  let netloc = "";
  if (rest.startsWith("//")) {
    const relative = rest.slice(2);
    const end = relative.search(/[/?#]/);
    if (end === -1) {
      netloc = relative;
      rest = "";
    } else {
      netloc = relative.slice(0, end);
      rest = relative.slice(end);
    }
  }

  return { scheme, netloc, path: rest };
}

export function isSafeRedirectTarget(req: Request, target: string | null | undefined): boolean {
  if (!target) return false;

  const parsed = parseTarget(target);
  if (!parsed.netloc) {
    return parsed.path.startsWith("/");
  }

  const host = req.get("host");
  return (
    (parsed.scheme === "http" || parsed.scheme === "https") &&
    host !== undefined &&
    parsed.netloc === host
  );
}

function requestUrl(req: Request): string {
  const host = req.get("host") ?? "localhost";
  return `${req.protocol}://${host}${req.originalUrl}`;
}

/** Port of `_store_post_login_redirect`. */
export function storePostLoginRedirect(req: Request): void {
  if (req.method === "GET" && isSafeRedirectTarget(req, requestUrl(req))) {
    req.session[AUTH_RETURN_TO_KEY] = requestUrl(req);
    return;
  }

  const referrer = req.get("referer");
  if (isSafeRedirectTarget(req, referrer)) {
    req.session[AUTH_RETURN_TO_KEY] = referrer;
    return;
  }

  req.session[AUTH_RETURN_TO_KEY] = "/";
}

/** Port of `_pop_post_login_redirect`. */
export function popPostLoginRedirect(req: Request): string {
  const target: string | undefined = req.session[AUTH_RETURN_TO_KEY];
  delete req.session[AUTH_RETURN_TO_KEY];
  if (target && isSafeRedirectTarget(req, target)) {
    return target;
  }
  return "/";
}

/** Port of `_login_claims`: request the claims the app depends on. */
export function loginClaims(): string {
  return JSON.stringify({
    id_token: {
      preferred_username: { essential: true },
      uiucedu_is_member_of: { essential: true },
    },
  });
}
