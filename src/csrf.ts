import crypto from "node:crypto";
import type { Request, RequestHandler } from "express";
import { HttpError } from "./helpers.js";

const CSRF_SESSION_KEY = "_csrf_token";

/** Get-or-create a per-session CSRF token. */
export function getCsrfToken(req: Request): string {
  if (!req.session) return "";
  const existing = req.session[CSRF_SESSION_KEY];
  if (typeof existing !== "string" || existing === "") {
    req.session[CSRF_SESSION_KEY] = crypto.randomBytes(24).toString("hex");
  }
  return req.session[CSRF_SESSION_KEY] as string;
}

/**
 * Express port of Flask-WTF's `CSRFProtect`: state-changing requests must
 * carry the session's CSRF token as the `csrf_token` form field (or the
 * `x-csrf-token` header). Failures surface as HTTP 400.
 */
export const csrfProtect: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS", "TRACE"].includes(req.method)) {
    next();
    return;
  }

  const expected = getCsrfToken(req);
  const body = req.body as Record<string, unknown> | undefined;
  const submitted =
    (body && typeof body.csrf_token === "string" && body.csrf_token) ||
    req.get("x-csrf-token") ||
    "";

  if (expected === "" || submitted !== expected) {
    next(new HttpError(400, "The CSRF token is missing or invalid."));
    return;
  }
  next();
};
