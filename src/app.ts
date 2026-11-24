import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import session from "express-session";
import cookieParser from "cookie-parser";

import {
  AUTH_SESSION_KEY,
  AUTH_ID_TOKEN_KEY,
  AUTH_RETURN_TO_KEY,
  AUTH_EXEMPT_PATHS,
  type AuthBackend,
  type SessionUser,
  sessionUserRoles,
  activeSessionRole,
  currentUser,
  isAuthenticated,
  currentUserRole,
  isSafeRedirectTarget,
} from "./auth.js";
import { securityHeaders } from "./security.js";
import { csrfProtect, injectCsrfToken } from "./csrf.js";
import { flash, takeFlashes, flashError, ValidationError } from "./helpers.js";
import { logger } from "./logger.js";
import * as queries from "./queries.js";
import { NotFoundError } from "./queries.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface AppOptions {
  authBackend: AuthBackend;
  extraRouters?: express.Router[];
  overrides?: Array<(app: Express) => void>;
  developerMode?: boolean;
  /** When true, unauthenticated requests are transparently authenticated with an
      `avdb-e2e` viewer/developer user (development auth bypass). */
  autoDevAuth?: boolean;
}

const DEV_DEFAULT_USER = { netid: "avdb-e2e", roles: ["viewer", "developer"], role: "viewer" };

export function buildApp(options: AppOptions): Express {
  const app = express();
  const devMode = options.developerMode ?? false;

  app.disable("x-powered-by");
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  app.use(cookieParser());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  app.use(
    session({
      name: "avdb_session",
      secret: process.env.SECRET_KEY || "dev-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.SESSION_COOKIE_SECURE === "true" || devMode === false,
      },
    }),
  );

  app.use(securityHeaders);
  app.use("/static", express.static(path.join(__dirname, "static")));

  // Render context base values
  app.use((req, res, next) => {
    res.locals.developer_mode = devMode;
    next();
  });

  // Inject CSRF into template context; flash messages are consumed at render
  // time so messages flashed during the same request (e.g. 403s) are shown.
  app.use((req, res, next) => {
    injectCsrfToken(req, res);
    const originalRender = res.render.bind(res);
    res.render = (view: string, options?: object, callback?: any) => {
      res.locals.flashes = takeFlashes(req);
      if (options && typeof options === "object" && !(options as any).flashes) {
        (options as any).flashes = res.locals.flashes;
      }
      return callback
        ? originalRender(view, options, callback)
        : originalRender(view, options);
    };
    next();
  });

  // Requirement gate: state-changing requests must carry a valid CSRF token.
  app.use(csrfProtect);

  // Global authentication gate
  const requireLogin = (req: Request, res: Response, next: NextFunction): void => {
    if (AUTH_EXEMPT_PATHS.has(req.path)) return next();
    if (!isAuthenticated(req)) {
      if (options.autoDevAuth) {
        const user: SessionUser = DEV_DEFAULT_USER;
        (req.session as any)[AUTH_SESSION_KEY] = user;
        return next();
      }
      storePostLoginRedirect(req, res);
      return res.redirect("/login");
    }
    const roles = sessionUserRoles(currentUser(req));
    if (roles.length === 0) {
      flash(req, "You are not registered in this application. Contact an administrator.", "error");
      res.status(403);
      return res.render("error");
    }
    return next();
  };
  app.use(requireLogin);

  // Auth state shared with templates (computed after the login gate, so dev
  // auto-authentication is reflected in the template context).
  app.use((req, res, next) => {
    res.locals.current_user = currentUser(req);
    res.locals.current_role = isAuthenticated(req) ? activeSessionRole(currentUser(req)) : null;
    res.locals.session = req.session;
    next();
  });

  // ---- Role guard helpers ---------------------------------------------------

  const rolesAccepted = (...roles: string[]) =>
    (req: Request, res: Response, next: NextFunction): void => {
      const role = currentUserRole(req);
      if (role && roles.includes(role)) return next();
      flash(req, "You do not have permission to perform that action.", "error");
      res.status(403);
      return res.render("error");
    };

  const writeRoles = rolesAccepted("maintainer", "admin");
  const readRoles = rolesAccepted("viewer", "maintainer", "admin");

  // ---- Auth endpoints -------------------------------------------------------

  app.get("/login", (req, res) => {
    if (isAuthenticated(req)) {
      return res.redirect(popPostLoginRedirect(req, res));
    }
    return options.authBackend.login(req, res);
  });

  app.get("/auth/callback", (req, res) => {
    try {
      options.authBackend.authCallback(req, res);
    } catch (exc) {
      logger.error("Unable to complete login", exc);
      delete (req.session as any)[AUTH_SESSION_KEY];
      delete (req.session as any)[AUTH_ID_TOKEN_KEY];
      delete (req.session as any)[AUTH_RETURN_TO_KEY];
      flashError(req, logger, "Unable to complete login", exc);
      res.status(500);
      res.render("error");
    }
  });

  app.get("/logout", (req, res) => {
    req.session.destroy(() => {
      let logoutUrl: string | null = null;
      try {
        logoutUrl = options.authBackend.logoutRedirectUrl();
      } catch (exc) {
        logger.error("Unable to resolve Illinois logout endpoint", exc);
      }
      if (logoutUrl) return res.redirect(logoutUrl);
      return res.redirect("/login");
    });
  });

  // ---- Index / systems -------------------------------------------------------

  app.get("/", readRoles, (_req, res) => {
    res.redirect("/systems");
  });

  app.get("/systems", readRoles, async (_req, res, next) => {
    try {
      const systems = await queries.listSystems();
      res.render("systems_list", { systems });
    } catch (exc) {
      next(exc);
    }
  });

  app.get("/systems/new", writeRoles, async (_req, res, next) => {
    try {
      const [sites, organizations, contacts] = await Promise.all([
        queries.listSites(),
        queries.listOrganizations(),
        queries.listContacts(),
      ]);
      res.render("system_form", {
        system: null,
        sites,
        organizations,
        contacts,
        installationStatuses: InstallationStatusList,
        formAction: "/systems/new",
      });
    } catch (exc) {
      next(exc);
    }
  });

  app.post("/systems/new", writeRoles, async (req, res, next) => {
    try {
      await queries.createSystem(req.body, req);
      flash(req, "System created.", "success");
      return res.redirect("/systems");
    } catch (exc) {
      flashError(req, logger, "Unable to create system", exc);
    }
    const [sites, organizations, contacts] = await Promise.all([
      queries.listSites(),
      queries.listOrganizations(),
      queries.listContacts(),
    ]);
    res.render("system_form", {
      system: null,
      sites,
      organizations,
      contacts,
      installationStatuses: InstallationStatusList,
      formAction: "/systems/new",
    });
  });

  app.get("/systems/:id/detail", readRoles, async (req, res, next) => {
    try {
      const system = await queries.getSystem(String(req.params.id));
      res.render("system_detail", { system });
    } catch (exc) {
      next(exc);
    }
  });

  app.get("/systems/:id/edit", writeRoles, async (req, res, next) => {
    try {
      const system = await queries.getSystemForEdit(String(req.params.id));
      const [sites, organizations, contacts] = await Promise.all([
        queries.listSites(),
        queries.listOrganizations(),
        queries.listContacts(),
      ]);
      res.render("system_form", {
        system,
        sites,
        organizations,
        contacts,
        installationStatuses: InstallationStatusList,
        formAction: `/systems/${system.id}/edit`,
      });
    } catch (exc) {
      next(exc);
    }
  });

  app.post("/systems/:id/edit", writeRoles, async (req, res, next) => {
    let system;
    try {
      system = await queries.getSystemForEdit(String(req.params.id));
      await queries.updateSystem(system.id, req.body, req);
      flash(req, "System updated.", "success");
      return res.redirect("/systems");
    } catch (exc) {
      flashError(req, logger, "Unable to update system", exc);
    }
    const [sites, organizations, contacts] = await Promise.all([
      queries.listSites(),
      queries.listOrganizations(),
      queries.listContacts(),
    ]);
    res.render("system_form", {
      system,
      sites,
      organizations,
      contacts,
      installationStatuses: InstallationStatusList,
      formAction: `/systems/${String(req.params.id)}/edit`,
    });
  });

  app.post("/systems/:id/delete", writeRoles, async (req, res, next) => {
    try {
      await queries.deleteSystem(String(req.params.id));
      flash(req, "System deleted.", "success");
    } catch (exc) {
      flashError(req, logger, "Unable to delete system", exc);
    }
    res.redirect("/systems");
  });

  // ---- Sites -----------------------------------------------------------------

  app.get("/sites", readRoles, async (_req, res, next) => {
    try {
      const sites = await queries.listSites();
      res.render("sites_list", { sites });
    } catch (exc) {
      next(exc);
    }
  });

  app.get("/sites/new", writeRoles, async (_req, res, next) => {
    try {
      const [organizations, contacts] = await Promise.all([
        queries.listOrganizations(),
        queries.listContacts(),
      ]);
      res.render("site_form", {
        site: null,
        organizations,
        contacts,
        ownershipOptions: SiteOwnershipList,
        statusOptions: SiteStatusList,
        formAction: "/sites/new",
      });
    } catch (exc) {
      next(exc);
    }
  });

  app.post("/sites/new", writeRoles, async (req, res, next) => {
    try {
      await queries.createSite(req.body, req);
      flash(req, "Site created.", "success");
      return res.redirect("/sites");
    } catch (exc) {
      flashError(req, logger, "Unable to create site", exc);
    }
    const [organizations, contacts] = await Promise.all([
      queries.listOrganizations(),
      queries.listContacts(),
    ]);
    res.render("site_form", {
      site: null,
      organizations,
      contacts,
      ownershipOptions: SiteOwnershipList,
      statusOptions: SiteStatusList,
      formAction: "/sites/new",
    });
  });

  app.get("/sites/:id/detail", readRoles, async (req, res, next) => {
    try {
      const site = await queries.getSite(String(req.params.id));
      res.render("site_detail", { site });
    } catch (exc) {
      next(exc);
    }
  });

  app.get("/sites/:id/edit", writeRoles, async (req, res, next) => {
    try {
      const site = await queries.getSiteForEdit(String(req.params.id));
      const [organizations, contacts] = await Promise.all([
        queries.listOrganizations(),
        queries.listContacts(),
      ]);
      res.render("site_form", {
        site,
        organizations,
        contacts,
        ownershipOptions: SiteOwnershipList,
        statusOptions: SiteStatusList,
        formAction: `/sites/${site.id}/edit`,
      });
    } catch (exc) {
      next(exc);
    }
  });

  app.post("/sites/:id/edit", writeRoles, async (req, res, next) => {
    let site;
    try {
      site = await queries.getSiteForEdit(String(req.params.id));
      await queries.updateSite(site.id, req.body, req);
      flash(req, "Site updated.", "success");
      return res.redirect("/sites");
    } catch (exc) {
      flashError(req, logger, "Unable to update site", exc);
    }
    const [organizations, contacts] = await Promise.all([
      queries.listOrganizations(),
      queries.listContacts(),
    ]);
    res.render("site_form", {
      site,
      organizations,
      contacts,
      ownershipOptions: SiteOwnershipList,
      statusOptions: SiteStatusList,
      formAction: `/sites/${String(req.params.id)}/edit`,
    });
  });

  app.post("/sites/:id/delete", writeRoles, async (req, res, next) => {
    try {
      const blocked = await queries.siteHasSystems(String(req.params.id));
      if (blocked) {
        flash(req, "Unable to delete site: remove or reassign linked systems first.", "error");
        return res.redirect(`/sites/${String(req.params.id)}/edit`);
      }
      await queries.deleteSite(String(req.params.id));
      flash(req, "Site deleted.", "success");
    } catch (exc) {
      flashError(req, logger, "Unable to delete site", exc);
      return res.redirect(`/sites/${String(req.params.id)}/edit`);
    }
    res.redirect("/sites");
  });

  // ---- Organizations -----------------------------------------------------------

  app.get("/organizations", readRoles, async (_req, res, next) => {
    try {
      const organizations = await queries.listOrganizations();
      res.render("organizations_list", { organizations });
    } catch (exc) {
      next(exc);
    }
  });

  app.get("/organizations/new", writeRoles, async (_req, res, next) => {
    res.render("organization_form", {
      organization: null,
      orgTypeOptions: OrganizationTypeList,
      formAction: "/organizations/new",
    });
  });

  app.post("/organizations/new", writeRoles, async (req, res, next) => {
    try {
      await queries.createOrganization(req.body, req);
      flash(req, "Organization created.", "success");
      return res.redirect("/organizations");
    } catch (exc) {
      flashError(req, logger, "Unable to create organization", exc);
    }
    res.render("organization_form", {
      organization: null,
      orgTypeOptions: OrganizationTypeList,
      formAction: "/organizations/new",
    });
  });

  app.get("/organizations/:id/detail", readRoles, async (req, res, next) => {
    try {
      const organization = await queries.getOrganization(String(req.params.id));
      res.render("organization_detail", { organization });
    } catch (exc) {
      next(exc);
    }
  });

  app.get("/organizations/:id/edit", writeRoles, async (req, res, next) => {
    try {
      const organization = await queries.getOrganization(String(req.params.id));
      res.render("organization_form", {
        organization,
        orgTypeOptions: OrganizationTypeList,
        formAction: `/organizations/${organization.id}/edit`,
      });
    } catch (exc) {
      next(exc);
    }
  });

  app.post("/organizations/:id/edit", writeRoles, async (req, res, next) => {
    let organization;
    try {
      organization = await queries.getOrganization(String(req.params.id));
      await queries.updateOrganization(organization.id, req.body, req);
      flash(req, "Organization updated.", "success");
      return res.redirect("/organizations");
    } catch (exc) {
      flashError(req, logger, "Unable to update organization", exc);
    }
    res.render("organization_form", {
      organization,
      orgTypeOptions: OrganizationTypeList,
      formAction: `/organizations/${String(req.params.id)}/edit`,
    });
  });

  app.post("/organizations/:id/delete", writeRoles, async (req, res, next) => {
    try {
      const blockedReason = await queries.organizationDeleteBlocked(String(req.params.id));
      if (blockedReason) {
        flash(req, blockedReason, "error");
        return res.redirect(`/organizations/${String(req.params.id)}/edit`);
      }
      await queries.deleteOrganization(String(req.params.id));
      flash(req, "Organization deleted.", "success");
    } catch (exc) {
      flashError(req, logger, "Unable to delete organization", exc);
      return res.redirect(`/organizations/${String(req.params.id)}/edit`);
    }
    res.redirect("/organizations");
  });

  // ---- Contacts -----------------------------------------------------------------

  app.get("/contacts", readRoles, async (_req, res, next) => {
    try {
      const contacts = await queries.listContacts();
      res.render("contacts_list", { contacts });
    } catch (exc) {
      next(exc);
    }
  });

  app.get("/contacts/new", writeRoles, async (_req, res, next) => {
    try {
      const organizations = await queries.listOrganizations();
      res.render("contact_form", {
        contact: null,
        organizations,
        formAction: "/contacts/new",
      });
    } catch (exc) {
      next(exc);
    }
  });

  app.post("/contacts/new", writeRoles, async (req, res, next) => {
    try {
      await queries.createContact(req.body, req);
      flash(req, "Contact created.", "success");
      return res.redirect("/contacts");
    } catch (exc) {
      flashError(req, logger, "Unable to create contact", exc);
    }
    const organizations = await queries.listOrganizations();
    res.render("contact_form", {
      contact: null,
      organizations,
      formAction: "/contacts/new",
    });
  });

  app.get("/contacts/:id/detail", readRoles, async (req, res, next) => {
    try {
      const contact = await queries.getContact(String(req.params.id));
      res.render("contact_detail", { contact });
    } catch (exc) {
      next(exc);
    }
  });

  app.get("/contacts/:id/edit", writeRoles, async (req, res, next) => {
    try {
      const contact = await queries.getContact(String(req.params.id));
      const organizations = await queries.listOrganizations();
      res.render("contact_form", {
        contact,
        organizations,
        formAction: `/contacts/${contact.id}/edit`,
      });
    } catch (exc) {
      next(exc);
    }
  });

  app.post("/contacts/:id/edit", writeRoles, async (req, res, next) => {
    let contact;
    try {
      contact = await queries.getContact(String(req.params.id));
      await queries.updateContact(contact.id, req.body, req);
      flash(req, "Contact updated.", "success");
      return res.redirect("/contacts");
    } catch (exc) {
      flashError(req, logger, "Unable to update contact", exc);
    }
    const organizations = await queries.listOrganizations();
    res.render("contact_form", {
      contact,
      organizations,
      formAction: `/contacts/${String(req.params.id)}/edit`,
    });
  });

  app.post("/contacts/:id/delete", writeRoles, async (req, res, next) => {
    try {
      await queries.deleteContact(String(req.params.id));
      flash(req, "Contact deleted.", "success");
    } catch (exc) {
      flashError(req, logger, "Unable to delete contact", exc);
      return res.redirect(`/contacts/${String(req.params.id)}/edit`);
    }
    res.redirect("/contacts");
  });

  // ---- Dev routers ----------------------------------------------------------------

  for (const router of options.extraRouters || []) {
    app.use(router);
  }

  for (const override of options.overrides || []) {
    override(app);
  }

  // ---- Error handlers --------------------------------------------------------------

  // 404 fallback within the authenticated area
  app.use((req, res) => {
    res.status(404);
    res.render("error");
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof NotFoundError) {
      res.status(404);
      return res.render("error");
    }
    if (err instanceof ValidationError) {
      // Validation errors are surfaced to the user, not as a 500.
      res.status(400);
      return res.render("error");
    }
    logger.error("Unhandled exception", err);
    res.status(err.status || 500);
    res.render("error");
  });

  return app;
}

// ---- Route helpers ------------------------------------------------------------

function storePostLoginRedirect(req: Request, res: Response): void {
  if (req.method === "GET" && isSafeRedirectTarget(req.originalUrl, req)) {
    (req.session as any)[AUTH_RETURN_TO_KEY] = req.originalUrl;
    return;
  }
  const referrer = req.get("referer");
  if (isSafeRedirectTarget(referrer, req)) {
    (req.session as any)[AUTH_RETURN_TO_KEY] = referrer;
    return;
  }
  (req.session as any)[AUTH_RETURN_TO_KEY] = "/";
}

function popPostLoginRedirect(req: Request, res: Response): string {
  const session = req.session as any;
  const target = session[AUTH_RETURN_TO_KEY];
  delete session[AUTH_RETURN_TO_KEY];
  return isSafeRedirectTarget(target, req) ? target : "/";
}

// Re-export list constants for the config arrays referenced above.
const OrganizationTypeList = ["Internal", "External"];
const SiteOwnershipList = ["Owned", "Leased", "P3", "Other", "Occupied"];
const SiteStatusList = ["Active", "Inactive", "Planned"];
const InstallationStatusList = ["Planned", "Installed", "Maintenance", "Retired"];