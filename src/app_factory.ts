import type { Express, Router } from "express";
import { buildApp, type AppBuildOptions, type ContextProcessor } from "./app.js";
import type { AuthBackend } from "./auth.js";
import { OidcAuthBackend } from "./oidc.js";

/**
 * Mutate the app build options before the Express app is assembled. Port of
 * the `app_overrides` passed to Flask's `create_app` (e.g. the dev auth bypass
 * and dev security overrides).
 */
export type AppOverride = (build: AppBuildOptions) => void;

export interface CreateAppOptions {
  /** Auth backend; defaults to the Illinois Shibboleth OIDC backend. */
  authBackend?: AuthBackend;
  /** Extra routers (e.g. the dev role blueprint). */
  blueprints?: Router[];
  /** Build-option overrides applied before assembly. */
  appOverrides?: AppOverride[];
  /** Context processors (e.g. the dev developer_mode injection). */
  contextProcessors?: ContextProcessor[];
}

/**
 * Compose the Express app with injected auth/role dependencies. Port of
 * `create_app()` from `src/app_factory.py`.
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const build: AppBuildOptions = {
    authBackend: options.authBackend ?? new OidcAuthBackend(),
    extraRouters: options.blueprints,
    contextProcessors: options.contextProcessors,
  };

  for (const override of options.appOverrides ?? []) {
    override(build);
  }

  return buildApp(build);
}
