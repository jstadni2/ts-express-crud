import http from "node:http";
import { fileURLToPath } from "node:url";
import type { Request, Response } from "express";
import type { AppBuildOptions } from "../src/app.js";
import { createApp } from "../src/app_factory.js";
import { currentUser, sessionUserRoles } from "../src/auth.js";
import { closePool } from "../src/db.js";
import { logger } from "../src/logger.js";
import { BypassAuthBackend, overrideRequireLogin } from "./auth_bypass.js";
import { devRoleRouter } from "./blueprints.js";
import { overrideConfigureSecurity } from "./csp_override.js";

/**
 * Development app: authentication bypass + developer role switching.
 * Port of `dev/app_dev.py`.
 */
export const app = createApp({
  authBackend: new BypassAuthBackend(),
  blueprints: [devRoleRouter],
  appOverrides: [overrideRequireLogin, overrideConfigureSecurity],
  contextProcessors: [
    (req: Request, res: Response) => {
      // Port of the `inject_developer_mode` context processor.
      res.locals.developer_mode = sessionUserRoles(currentUser(req)).includes("developer");
    },
  ],
});

const isMain =
  typeof process !== "undefined" &&
  process.argv.length > 1 &&
  process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const port = Number(process.env.PORT ?? 8080);

  const server = http.createServer(app);
  server.listen(port, () => {
    logger.info(`AVDB dev server listening on http://0.0.0.0:${port}`);
  });

  const shutdown = (signal: string): void => {
    logger.info(`${signal} received; shutting down`);
    server.close();
    void closePool();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
