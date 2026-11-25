import type { RequestHandler } from "express";

export interface SecurityOptions {
  /** Mirrors Flask's `SESSION_COOKIE_SECURE`. */
  cookieSecure: boolean;
  /** Mirrors Flask's `PREFERRED_URL_SCHEME`. */
  preferredScheme: "http" | "https";
  /** Mirrors Flask's `SECURITY_HEADERS` config. */
  headers: Record<string, string>;
}

export const PRODUCTION_CSP = [
  "default-src 'self'; ",
  "img-src 'self' data: https://cdn.brand.illinois.edu; ",
  "script-src 'self' 'unsafe-inline' https://cdn.toolkit.illinois.edu https://cdn.disability.illinois.edu https://onetrust.techservices.illinois.edu; ",
  "style-src 'self' 'unsafe-inline' https://cdn.toolkit.illinois.edu https://cdn.brand.illinois.edu https://onetrust.techservices.illinois.edu; ",
  "font-src 'self' data: https://cdn.toolkit.illinois.edu https://cdn.brand.illinois.edu; ",
  "connect-src 'self' https://cdn.brand.illinois.edu https://onetrust.techservices.illinois.edu; ",
  "object-src 'none'; ",
  "base-uri 'self'; ",
  "frame-ancestors 'none'; ",
  "form-action 'self'",
].join("");

/** Port of `configure_security()` production defaults from `src/app.py`. */
export function productionSecurityOptions(): SecurityOptions {
  return {
    cookieSecure: true,
    preferredScheme: "https",
    headers: {
      "content-security-policy": PRODUCTION_CSP,
      "x-frame-options": "SAMEORIGIN",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "geolocation=(), microphone=(), camera=()",
    },
  };
}

/** Port of the `after_request` security header handler from `src/app.py`. */
export function securityHeaders(options: SecurityOptions): RequestHandler {
  return (req, res, next) => {
    for (const [key, value] of Object.entries(options.headers)) {
      res.setHeader(key, value);
    }

    if (req.secure) {
      res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
    }
    next();
  };
}
