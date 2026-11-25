import express, { type Request, type Response } from "express";
import { AUTH_SESSION_KEY, type SessionUser } from "../src/auth.js";
import { flash } from "../src/helpers.js";
import { renderPage } from "../src/views.js";

/**
 * Developer role-switching blueprint. Port of `dev/blueprints.py`
 * (`dev_role_bp`): `/dev/role` for interactive switching and
 * `/dev/mock-session-role` for scripted (e2e) role selection.
 */
export const devRoleRouter = express.Router();

function currentSessionUser(req: Request): SessionUser | null {
  const user = req.session[AUTH_SESSION_KEY];
  return user && typeof user === "object" ? user : null;
}

function normalizeRole(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const normalized = String(raw).trim().toLowerCase();
  if (["admin", "maintainer", "viewer"].includes(normalized)) {
    return normalized;
  }
  return null;
}

/** Port of `_session_roles` from `dev/blueprints.py`. */
function sessionRoles(user: SessionUser | null): string[] {
  if (!user || typeof user !== "object") return [];
  let rawRoles: unknown = user.roles ?? [];
  if (typeof rawRoles === "string") rawRoles = [rawRoles];

  const roles: string[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(rawRoles) ? rawRoles : []) {
    const normalized = normalizeRole(raw);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      roles.push(normalized);
    }
  }

  const developer =
    Array.isArray(rawRoles) && rawRoles.map((role) => String(role)).includes("developer");
  if (developer && !roles.includes("developer")) {
    roles.push("developer");
  }
  return roles;
}

function titleCase(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

devRoleRouter.get("/dev/role", handleDevRole);
devRoleRouter.post("/dev/role", handleDevRole);

async function handleDevRole(req: Request, res: Response): Promise<void> {
  const user = currentSessionUser(req);
  if (!user || !sessionRoles(user).includes("developer")) {
    flash(req, "error", "Developer mode role switching is not enabled for your account.");
    res.status(403);
    await renderPage(req, res, "error");
    return;
  }

  if (req.method === "POST") {
    const selected = normalizeRole(req.body?.role);
    if (selected === null) {
      flash(req, "error", "Invalid role selected.");
      res.redirect("/dev/role");
      return;
    }

    const roles = sessionRoles(user).filter(
      (role) => !["admin", "maintainer", "viewer"].includes(role),
    );
    roles.push(selected);
    user.roles = roles;
    user.role = selected;
    req.session[AUTH_SESSION_KEY] = user;
    flash(req, "success", `Active role set to ${titleCase(selected)}.`);
    res.redirect("/dev/role");
    return;
  }

  const activeRole =
    (typeof user.role === "string" ? normalizeRole(user.role) : null) ??
    ["admin", "maintainer", "viewer"].find((role) => sessionRoles(user).includes(role)) ??
    null;

  await renderPage(req, res, "dev_role", {
    role_options: ["Admin", "Maintainer", "Viewer"],
    active_role: activeRole ? titleCase(activeRole) : null,
  });
}

devRoleRouter.get("/dev/mock-session-role", handleMockSessionRole);
devRoleRouter.post("/dev/mock-session-role", handleMockSessionRole);

function handleMockSessionRole(req: Request, res: Response): void {
  const queryRole = Array.isArray(req.query.role) ? req.query.role[0] : req.query.role;
  const selected = normalizeRole(queryRole ?? req.body?.role);
  if (selected === null) {
    flash(req, "error", "Invalid role selected.");
    res.redirect("/");
    return;
  }

  req.session[AUTH_SESSION_KEY] = {
    netid: "avdb-e2e",
    roles: ["developer", selected],
    role: selected,
  };
  flash(req, "success", `Active role set to ${titleCase(selected)}.`);
  res.redirect("/");
}
