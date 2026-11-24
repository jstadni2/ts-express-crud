import { Router, type Request, type Response } from "express";

import { AUTH_SESSION_KEY, type SessionUser, sessionUserRoles, normalizeRoleName } from "../src/auth.js";
import { flash } from "../src/helpers.js";
import { getCsrfToken } from "../src/csrf.js";

export const devRoleRouter: Router = Router();

function currentSessionUser(req: Request): SessionUser | null {
  const user = (req.session as any)[AUTH_SESSION_KEY];
  return user && typeof user === "object" ? (user as SessionUser) : null;
}

function sessionRoles(user: SessionUser | null): string[] {
  return sessionUserRoles(user);
}

function normalizeRole(raw: string | undefined | null): string | null {
  const normalized = normalizeRoleName(raw);
  return normalized && normalized !== "developer" ? normalized : null;
}

// GET/POST role selection page (requires the developer flag)
devRoleRouter.get("/dev/role", (req: Request, res: Response) => {
  const user = currentSessionUser(req);
  res.locals.csrf_token = getCsrfToken(req);
  if (!user || !sessionRoles(user).includes("developer")) {
    flash(req, "Developer mode role switching is not enabled for your account.", "error");
    res.status(403);
    return res.render("error");
  }
  const activeRole =
    user.role ||
    ["admin", "maintainer", "viewer"].find((r) => sessionRoles(user).includes(r)) ||
    null;
  res.render("dev_role", {
    roleOptions: ["Admin", "Maintainer", "Viewer"],
    active_role: activeRole ? activeRole[0].toUpperCase() + activeRole.slice(1) : null,
  });
});

devRoleRouter.post("/dev/role", (req: Request, res: Response) => {
  const user = currentSessionUser(req);
  if (!user || !sessionRoles(user).includes("developer")) {
    flash(req, "Developer mode role switching is not enabled for your account.", "error");
    res.status(403);
    return res.render("error");
  }
  const selected = normalizeRole(req.body.role);
  if (selected === null) {
    flash(req, "Invalid role selected.", "error");
    return res.redirect("/dev/role");
  }
  const baseRoles = sessionRoles(user).filter(
    (r) => !["admin", "maintainer", "viewer"].includes(r),
  );
  baseRoles.push(selected);
  user.roles = baseRoles;
  user.role = selected;
  (req.session as any)[AUTH_SESSION_KEY] = user;
  flash(req, `Active role set to ${selected[0].toUpperCase() + selected.slice(1)}.`, "success");
  return res.redirect("/dev/role");
});

// Dev-only mock session role endpoint
devRoleRouter.all("/dev/mock-session-role", (req: Request, res: Response) => {
  const raw = (typeof req.query.role === "string" ? req.query.role : undefined) ||
    (typeof req.body?.role === "string" ? req.body.role : undefined);
  const selected = normalizeRole(raw);
  if (selected === null) {
    flash(req, "Invalid role selected.", "error");
    return res.redirect("/");
  }
  const sessionUser: SessionUser = {
    netid: "avdb-e2e",
    roles: ["developer", selected],
    role: selected,
  };
  (req.session as any)[AUTH_SESSION_KEY] = sessionUser;
  flash(req, `Active role set to ${selected[0].toUpperCase() + selected.slice(1)}.`, "success");
  return res.redirect("/");
});