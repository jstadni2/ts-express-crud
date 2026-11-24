import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const CSRF_SESSION_KEY = "_csrf_token";

/** Get-or-create a per-session CSRF token. */
export function getCsrfToken(req: Request): string {
  const session = req.session as any;
  if (typeof session[CSRF_SESSION_KEY] !== "string" || !session[CSRF_SESSION_KEY]) {
    session[CSRF_SESSION_KEY] = crypto.randomBytes(24).toString("hex");
  }
  return session[CSRF_SESSION_KEY];
}

/** Express middleware that validates CSRF tokens for state-changing requests. */
export function csrfProtect(req: Request, res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS", "TRACE"].includes(req.method)) {
    return next();
  }

  const expected = getCsrfToken(req);
  const submitted =
    (req.body && typeof req.body === "object" && req.body.csrf_token) ||
    req.get("x-csrf-token") ||
    "";

  if (typeof submitted !== "string" || submitted === "" || submitted !== expected) {
    res.status(400);
    return res.render("error", { statusCode: 400, message: "CSRF validation failed." });
  }
  return next();
}

/** Attach the CSRF token to the template context. */
export function injectCsrfToken(req: Request, res: Response): void {
  res.locals.csrf_token = getCsrfToken(req);
}