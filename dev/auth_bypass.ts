import type { Request, RequestHandler, Response } from "express";
import { AUTH_EXEMPT_PATHS, type AuthBackend, type AuthCallbackResult } from "../src/auth.js";
import type { AppBuildOptions } from "../src/app.js";

/**
 * Development/testing auth backend used alongside a require_login override.
 * Port of `dev/auth_bypass.py`.
 */
export class BypassAuthBackend implements AuthBackend {
  login(_req: Request, res: Response): void {
    res.redirect("/");
  }

  authCallback(): AuthCallbackResult {
    return { sessionUser: { netid: "avdb-e2e" }, idToken: "" };
  }

  logoutRedirectUrl(_req: Request): string | null {
    return null;
  }
}

export const DEV_DEFAULT_SESSION_USER = {
  netid: "avdb-e2e",
  roles: ["viewer", "developer"],
  role: "viewer",
} as const;

/**
 * Replace the core login gate with a development bypass that transparently
 * authenticates every request as the `avdb-e2e` user. Port of
 * `override_require_login` + the `AUTH_EXEMPT_ENDPOINTS.update(...)` call in
 * `dev/app_dev.py` (the dev endpoints are exempted by `dev/app_dev.ts`).
 */
export function overrideRequireLogin(build: AppBuildOptions): void {
  build.requireLogin = (exemptPaths: ReadonlySet<string>): RequestHandler => {
    return (req, _res, next) => {
      if (exemptPaths.has(req.path)) {
        next();
        return;
      }

      if (!req.session.user || typeof req.session.user !== "object") {
        req.session.user = {
          netid: DEV_DEFAULT_SESSION_USER.netid,
          roles: [...DEV_DEFAULT_SESSION_USER.roles],
          role: DEV_DEFAULT_SESSION_USER.role,
        };
      }

      next();
    };
  };
}

/** Development-only exemption set (superset of `AUTH_EXEMPT_PATHS`). */
export const DEV_AUTH_EXEMPT_PATHS: ReadonlySet<string> = new Set([
  ...AUTH_EXEMPT_PATHS,
  "/dev/role",
  "/dev/mock-session-role",
]);

export type { Request };
