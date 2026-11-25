import { productionSecurityOptions, type SecurityOptions } from "../src/security.js";
import type { AppBuildOptions } from "../src/app.js";

/**
 * Apply HTTP-compatible security settings for the local development app.
 * Port of `dev/csp_override.py`.
 */
export function devSecurityOptions(): SecurityOptions {
  const options = productionSecurityOptions();
  options.cookieSecure = false;
  options.preferredScheme = "http";

  let csp = options.headers["content-security-policy"] ?? "";
  for (const host of [
    "cdn.brand.illinois.edu",
    "cdn.toolkit.illinois.edu",
    "cdn.disability.illinois.edu",
    "onetrust.techservices.illinois.edu",
  ]) {
    csp = csp.replaceAll(`https://${host}`, `https://${host} http://${host}`);
  }
  options.headers["content-security-policy"] = csp;
  return options;
}

/** Build-options override applying the dev security configuration. */
export function overrideConfigureSecurity(build: AppBuildOptions): void {
  build.security = devSecurityOptions();
}
