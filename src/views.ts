import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Request, Response } from "express";
import { Liquid } from "liquidjs";
import { currentUser, currentUserRole, isAuthenticated } from "./auth.js";
import { getCsrfToken } from "./csrf.js";
import { takeFlashes } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const viewsDir = path.join(__dirname, "views");

const engine = new Liquid({
  root: viewsDir,
  extname: ".liquid",
  cache: process.env.NODE_ENV === "production",
});

/**
 * LiquidJS (like Shopify Liquid) does not auto-escape output, so the render
 * boundary applies HTML escaping to every context string — mirroring Jinja2's
 * autoescaping. Values under these keys are pre-escaped HTML and pass through
 * raw, mirroring Jinja's `| safe` filter.
 */
const RAW_CONTEXT_KEYS = new Set(["contacts_html"]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeDeep<T>(value: T): T {
  if (typeof value === "string") {
    return escapeHtml(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map(escapeDeep) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const escaped: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      escaped[key] = RAW_CONTEXT_KEYS.has(key) ? child : escapeDeep(child);
    }
    return escaped as unknown as T;
  }
  return value;
}

/**
 * Render a Liquid view with the shared base context (flash messages, current
 * user/role, CSRF token). Mirrors Flask's `render_template` + context
 * processors.
 */
export async function renderPage(
  req: Request,
  res: Response,
  template: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const context: Record<string, unknown> = {
    ...escapeDeep(data),
    flashes: escapeDeep(takeFlashes(req)),
    current_user: escapeDeep(currentUser(req)),
    current_role: isAuthenticated(req) ? currentUserRole(req) : null,
    developer_mode: Boolean(res.locals.developer_mode),
    csrf_token: getCsrfToken(req),
  };

  const html = await engine.renderFile(template, context);
  res.type("html").send(html);
}
