import { createApp } from "../src/app_factory.js";
import { BypassAuthBackend } from "./auth_bypass.js";
import { devRoleRouter } from "./blueprints.js";

// Development app: authentication bypass + developer role switching.
// Mirrors `dev/app_dev.py`.
export const app = createApp({
  authBackend: new BypassAuthBackend(),
  extraRouters: [devRoleRouter],
  developerMode: true,
  autoDevAuth: true,
});

const isMain =
  typeof process !== "undefined" &&
  process.argv.length > 1 &&
  process.argv[1].endsWith("app_dev.js");

if (isMain) {
  const port = Number(process.env.PORT || 5010);
  app.listen(port, () => {
    console.log(`AVDB dev server listening on port ${port}`);
  });
}