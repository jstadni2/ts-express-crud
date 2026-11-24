import type { Request, Response, NextFunction } from "express";

/** Production-safe HTTP security default headers. */
export function buildSecurityHeaders() {
  return {
    "content-security-policy":
      "default-src 'self'; " +
      "img-src 'self' data: https://cdn.brand.illinois.edu; " +
      "script-src 'self' 'unsafe-inline' https://cdn.toolkit.illinois.edu https://cdn.disability.illinois.edu https://onetrust.techservices.illinois.edu; " +
      "style-src 'self' 'unsafe-inline' https://cdn.toolkit.illinois.edu https://cdn.brand.illinois.edu https://onetrust.techservices.illinois.edu; " +
      "font-src 'self' data: https://cdn.toolkit.illinois.edu https://cdn.brand.illinois.edu; " +
      "connect-src 'self' https://cdn.brand.illinois.edu https://onetrust.techservices.illinois.edu; " +
      "object-src 'none'; " +
      "base-uri 'self'; " +
      "frame-ancestors 'none'; " +
      "form-action 'self'",
    "x-frame-options": "SAMEORIGIN",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "geolocation=(), microphone=(), camera=()",
  };
}

/** Express middleware that applies the configured security headers. */
export function securityHeaders(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const headers = buildSecurityHeaders();
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  const forwardedProto = req.get("x-forwarded-proto");
  const isSecure = req.secure || forwardedProto === "https";
  if (isSecure) {
    res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
  next();
}