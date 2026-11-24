import type { Express } from "express";

import { buildApp, type AppOptions } from "./app.js";
import { OIDCAuthBackend } from "./oidc.js";

/**
 * Compose the global Express app with injected auth/role dependencies,
 * mirroring the Flask `create_app` factory.
 */
export function createApp(
  options: Partial<AppOptions> = {},
): Express {
  return buildApp({
    authBackend: options.authBackend ?? new OIDCAuthBackend(),
    extraRouters: options.extraRouters ?? [],
    overrides: options.overrides ?? [],
    developerMode: options.developerMode ?? false,
    autoDevAuth: options.autoDevAuth ?? false,
  });
}