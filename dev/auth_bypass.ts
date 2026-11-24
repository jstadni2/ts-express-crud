import type { Request, Response } from "express";

import { AUTH_SESSION_KEY, type SessionUser, type AuthBackend } from "../src/auth.js";

/**
 * Development/testing auth backend used alongside an auto-auth override.
 * Login simply redirects to the systems index; the callback returns the
 * seeded `avdb-e2e` developer user.
 */
export class BypassAuthBackend implements AuthBackend {
  login(_req: Request, res: Response): void {
    res.redirect("/");
  }

  authCallback(req: Request, res: Response): void {
    const sessionUser: SessionUser = {
      netid: "avdb-e2e",
      roles: [],
      role: null,
    };
    (req.session as any)[AUTH_SESSION_KEY] = sessionUser;
    res.redirect("/");
  }

  logoutRedirectUrl(): string | null {
    return null;
  }
}