import { createApp } from "./app_factory.js";

export const app = createApp();

// Start the server only when run directly (e.g. `docker compose` CMD).
const isMain =
  typeof process !== "undefined" &&
  process.argv.length > 1 &&
  process.argv[1].endsWith("bootstrap.js");

if (isMain) {
  const port = Number(process.env.PORT || 443);
  app.listen(port, () => {
    console.log(`AVDB production server listening on port ${port}`);
  });
}