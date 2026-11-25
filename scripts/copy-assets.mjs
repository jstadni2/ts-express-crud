// Copies non-TS assets (Liquid views, static files) into dist/ after tsc emits.
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

mkdirSync(path.join(root, "dist/src"), { recursive: true });
cpSync(path.join(root, "src/views"), path.join(root, "dist/src/views"), { recursive: true });
cpSync(path.join(root, "src/static"), path.join(root, "dist/src/static"), { recursive: true });

console.log("Copied views and static assets into dist/src.");
