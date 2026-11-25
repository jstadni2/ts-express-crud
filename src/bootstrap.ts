import fs from "node:fs";
import https from "node:https";
import { createApp } from "./app_factory.js";
import { closePool } from "./db.js";
import { logger } from "./logger.js";

// Production entrypoint: serves HTTPS on :443 with the mounted certificates,
// mirroring the Gunicorn invocation in the Flask Dockerfile.
const port = Number(process.env.PORT ?? 443);

const server = https.createServer(
  {
    cert: fs.readFileSync("/certs/server.crt"),
    key: fs.readFileSync("/certs/server.key"),
  },
  createApp(),
);

server.listen(port, () => {
  logger.info(`AVDB production server listening on https://0.0.0.0:${port}`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received; shutting down`);
  server.close();
  await closePool();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
