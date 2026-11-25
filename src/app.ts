import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import session from "express-session";
import {
  AUTH_EXEMPT_PATHS,
  AUTH_ID_TOKEN_KEY,
  AUTH_RETURN_TO_KEY,
  AUTH_SESSION_KEY,
  currentUser,
  currentUserRole,
  isAuthenticated,
  popPostLoginRedirect,
  sessionUserRoles,
  storePostLoginRedirect,
  type AuthBackend,
} from "./auth.js";
import {
  CONTACT_COLUMNS,
  ORGANIZATION_COLUMNS,
  SITE_COLUMNS,
  SYSTEM_COLUMNS,
} from "./columns.js";
import { csrfProtect } from "./csrf.js";
import {
  formIntList,
  formIntOrNull,
  formRequiredInt,
  formString,
  formStringOr,
  getEnumByValue,
  HttpError,
  parseDateField,
  parseDecimalField,
  flash,
  flashError,
  ValidationError,
} from "./helpers.js";
import { logger } from "./logger.js";
import {
  INSTALLATION_STATUS,
  ORGANIZATION_TYPE,
  SITE_OWNERSHIP,
  SITE_STATUS,
} from "./models.js";
import { OidcAuthBackend } from "./oidc.js";
import * as queries from "./queries.js";
import { productionSecurityOptions, securityHeaders, type SecurityOptions } from "./security.js";
import { renderPage } from "./views.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.join(__dirname, "static");

function loadSecretKey(): string {
  const secretKey = process.env.SECRET_KEY;
  if (secretKey && secretKey.trim() !== "") {
    return secretKey.trim();
  }
  throw new RuntimeError("SECRET_KEY must be configured.");
}

class RuntimeError extends Error {}

/**
 * Context processors mirror Flask's `@app.context_processor` hook: they run
 * before route handlers and may extend `res.locals` (e.g. developer mode).
 */
export type ContextProcessor = (req: Request, res: Response) => void;

export interface AppBuildOptions {
  /** Auth backend injected by `create_app` (OIDC by default). */
  authBackend?: AuthBackend;
  /** Additional routers (e.g. the dev role blueprint). */
  extraRouters?: express.Router[];
  /** Extra paths that skip the login requirement (dev endpoints). */
  extraAuthExemptPaths?: string[];
  /** Replaces the core login gate (dev auth bypass). */
  requireLogin?: (exemptPaths: ReadonlySet<string>) => RequestHandler;
  /** Security configuration (production defaults unless overridden). */
  security?: SecurityOptions;
  /** Request context processors registered before the routers. */
  contextProcessors?: ContextProcessor[];
}

// ---------------------------------------------------------------------------
// Login gate (port of `require_login` + `@identity_loaded`)
// ---------------------------------------------------------------------------

function makeCoreRequireLogin(exemptPaths: ReadonlySet<string>): RequestHandler {
  return (req, res, next) => {
    if (exemptPaths.has(req.path)) return next();

    if (!isAuthenticated(req)) {
      storePostLoginRedirect(req);
      res.redirect("/login");
      return;
    }

    if (sessionUserRoles(currentUser(req)).length === 0) {
      flash(req, "error", "You are not registered in this application. Contact an administrator.");
      res.status(403);
      void renderPage(req, res, "error");
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Role guards (port of `@roles_accepted`)
// ---------------------------------------------------------------------------

/** Render the shared 403 page with the permission flash message. */
function renderForbidden(req: Request, res: Response): void {
  flash(req, "error", "You do not have permission to perform that action.");
  res.status(403);
  void renderPage(req, res, "error");
}

function rolesAccepted(...acceptedRoles: string[]): RequestHandler {
  return (req, _res, next) => {
    const role = currentUserRole(req);
    if (role && acceptedRoles.includes(role)) {
      next();
      return;
    }
    renderForbidden(req, _res);
  };
}

const readRoles = rolesAccepted("viewer", "maintainer", "admin");
const writeRoles = rolesAccepted("maintainer", "admin");

// ---------------------------------------------------------------------------
// Route param parsing (port of Flask's `<int:id>` converter)
// ---------------------------------------------------------------------------

function intId(req: Request, key: string): number {
  const raw = String(req.params[key] ?? "");
  if (!/^\d+$/.test(raw)) throw new HttpError(404);
  return Number.parseInt(raw, 10);
}

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

export function buildApp(build: AppBuildOptions = {}): Express {
  const app = express();
  const authBackend = build.authBackend ?? new OidcAuthBackend();
  const exemptPaths: ReadonlySet<string> = new Set([
    ...AUTH_EXEMPT_PATHS,
    ...(build.extraAuthExemptPaths ?? []),
  ]);
  const security = build.security ?? productionSecurityOptions();
  const requireLogin = build.requireLogin?.(exemptPaths) ?? makeCoreRequireLogin(exemptPaths);

  app.disable("x-powered-by");

  // Mirrors the Flask after_request security headers (applies to static too).
  app.use(securityHeaders(security));

  // Static files are served without a session, like Flask's exempt static route.
  app.use("/static", express.static(staticDir));

  app.use(express.urlencoded({ extended: true }));

  app.use(
    session({
      name: "avdb_session",
      secret: loadSecretKey(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: security.cookieSecure,
      },
    }),
  );

  // Context processors run after the session exists but before the routers.
  app.use((req, res, next) => {
    res.locals.developer_mode = false;
    next();
  });
  for (const processor of build.contextProcessors ?? []) {
    app.use((req, res, next) => {
      processor(req, res);
      next();
    });
  }

  // CSRF is validated before the login gate, matching Flask-WTF's ordering.
  app.use(csrfProtect);
  app.use(requireLogin);

  const router = express.Router();

  // ---- Auth endpoints ----------------------------------------------------

  router.get("/login", async (req, res) => {
    if (isAuthenticated(req)) {
      res.redirect(popPostLoginRedirect(req));
      return;
    }
    // Express 5 forwards handler rejections to the error middleware.
    await authBackend.login(req, res);
  });

  router.get("/auth/callback", async (req, res) => {
    try {
      const { sessionUser, idToken } = await authBackend.authCallback(req, res);
      req.session[AUTH_SESSION_KEY] = sessionUser;
      req.session[AUTH_ID_TOKEN_KEY] = idToken;
      res.redirect(popPostLoginRedirect(req));
    } catch (exc) {
      logger.exception("Unable to complete login", exc);
      delete req.session[AUTH_SESSION_KEY];
      delete req.session[AUTH_ID_TOKEN_KEY];
      delete req.session[AUTH_RETURN_TO_KEY];
      flashError(req, "Unable to complete login", exc);
      res.status(500);
      await renderPage(req, res, "error");
    }
  });

  router.get("/logout", (req, res) => {
    req.session.destroy(() => {
      let logoutUrl: string | null = null;
      try {
        logoutUrl = authBackend.logoutRedirectUrl(req);
      } catch (exc) {
        logger.exception("Unable to resolve Illinois logout endpoint", exc);
      }
      res.redirect(logoutUrl ?? "/login");
    });
  });

  // ---- Index -------------------------------------------------------------

  router.get("/", readRoles, (_req, res) => {
    res.redirect("/systems");
  });

  // ---- Systems -----------------------------------------------------------

  router.get("/systems", readRoles, async (req, res) => {
    const systems = await queries.listSystems();
    await renderPage(req, res, "systems_list", { systems, columns: SYSTEM_COLUMNS });
  });

  router.get("/systems/new", writeRoles, systemFormHandler(null));

  router.post("/systems/new", writeRoles, async (req, res) => {
    const [sites, organizations, contacts] = await Promise.all([
      queries.siteOptions(),
      queries.organizationOptions(),
      queries.contactOptions(),
    ]);

    try {
      const input = parseSystemInput(req);
      await queries.createSystem(input, formIntList(req, "contact_ids"));
      flash(req, "success", "System created.");
      res.redirect("/systems");
      return;
    } catch (exc) {
      flashError(req, "Unable to create system", exc);
    }

    await renderPage(req, res, "system_form", {
      system: null,
      sites,
      organizations,
      contacts,
      installation_statuses: Object.values(INSTALLATION_STATUS),
      form_action: "/systems/new",
    });
  });

  router.get("/systems/:systemId/detail", readRoles, async (req, res) => {
    const system = await queries.getSystemOr404(intId(req, "systemId"));
    await renderPage(req, res, "system_detail", { system });
  });

  router.get("/systems/:systemId/edit", writeRoles, systemEditFormHandler());

  router.post("/systems/:systemId/edit", writeRoles, async (req, res) => {
    const systemId = intId(req, "systemId");
    const system = await queries.getSystemOr404(systemId);
    const [sites, organizations, contacts] = await Promise.all([
      queries.siteOptions(),
      queries.organizationOptions(),
      queries.contactOptions(),
    ]);

    try {
      const input = parseSystemInput(req);
      await queries.updateSystem(systemId, input, formIntList(req, "contact_ids"));
      flash(req, "success", "System updated.");
      res.redirect("/systems");
      return;
    } catch (exc) {
      flashError(req, "Unable to update system", exc);
    }

    await renderPage(req, res, "system_form", {
      system,
      sites,
      organizations,
      contacts,
      installation_statuses: Object.values(INSTALLATION_STATUS),
      form_action: `/systems/${system.id}/edit`,
    });
  });

  router.post("/systems/:systemId/delete", writeRoles, async (req, res) => {
    const systemId = intId(req, "systemId");
    await queries.getSystemOr404(systemId);

    try {
      await queries.deleteSystem(systemId);
      flash(req, "success", "System deleted.");
    } catch (exc) {
      flashError(req, "Unable to delete system", exc);
    }

    res.redirect("/systems");
  });

  // ---- Sites ---------------------------------------------------------------

  router.get("/sites", readRoles, async (req, res) => {
    const sites = await queries.listSites();
    await renderPage(req, res, "sites_list", { sites, columns: SITE_COLUMNS });
  });

  router.get("/sites/new", writeRoles, siteFormHandler(null));

  router.post("/sites/new", writeRoles, async (req, res) => {
    const [organizations, contacts] = await Promise.all([
      queries.organizationOptions(),
      queries.contactOptions(),
    ]);

    try {
      const input = parseSiteInput(req);
      await queries.createSite(input, formIntList(req, "contact_ids"));
      flash(req, "success", "Site created.");
      res.redirect("/sites");
      return;
    } catch (exc) {
      flashError(req, "Unable to create site", exc);
    }

    await renderPage(req, res, "site_form", {
      site: null,
      organizations,
      contacts,
      ownership_options: Object.values(SITE_OWNERSHIP),
      status_options: Object.values(SITE_STATUS),
      form_action: "/sites/new",
    });
  });

  router.get("/sites/:siteId/detail", readRoles, async (req, res) => {
    const site = await queries.getSiteOr404(intId(req, "siteId"));
    await renderPage(req, res, "site_detail", { site });
  });

  router.get("/sites/:siteId/edit", writeRoles, siteEditFormHandler());

  router.post("/sites/:siteId/edit", writeRoles, async (req, res) => {
    const siteId = intId(req, "siteId");
    const site = await queries.getSiteOr404(siteId);
    const [organizations, contacts] = await Promise.all([
      queries.organizationOptions(),
      queries.contactOptions(),
    ]);

    try {
      const input = parseSiteInput(req);
      await queries.updateSite(siteId, input, formIntList(req, "contact_ids"));
      flash(req, "success", "Site updated.");
      res.redirect("/sites");
      return;
    } catch (exc) {
      flashError(req, "Unable to update site", exc);
    }

    await renderPage(req, res, "site_form", {
      site,
      organizations,
      contacts,
      ownership_options: Object.values(SITE_OWNERSHIP),
      status_options: Object.values(SITE_STATUS),
      form_action: `/sites/${site.id}/edit`,
    });
  });

  router.post("/sites/:siteId/delete", writeRoles, async (req, res) => {
    const siteId = intId(req, "siteId");
    const site = await queries.getSiteOr404(siteId);

    if (await queries.siteHasSystems(siteId)) {
      flash(req, "error", "Unable to delete site: remove or reassign linked systems first.");
      res.redirect(`/sites/${site.id}/edit`);
      return;
    }

    try {
      await queries.deleteSite(siteId);
      flash(req, "success", "Site deleted.");
    } catch (exc) {
      flashError(req, "Unable to delete site", exc);
      res.redirect(`/sites/${site.id}/edit`);
      return;
    }

    res.redirect("/sites");
  });

  // ---- Organizations -------------------------------------------------------

  router.get("/organizations", readRoles, async (req, res) => {
    const organizations = await queries.listOrganizations();
    await renderPage(req, res, "organizations_list", {
      organizations,
      columns: ORGANIZATION_COLUMNS,
    });
  });

  router.get("/organizations/new", writeRoles, (req, res) => {
    void renderOrganizationForm(req, res, null);
  });

  router.post("/organizations/new", writeRoles, async (req, res) => {
    try {
      await queries.createOrganization(parseOrganizationInput(req));
      flash(req, "success", "Organization created.");
      res.redirect("/organizations");
      return;
    } catch (exc) {
      flashError(req, "Unable to create organization", exc);
    }
    await renderOrganizationForm(req, res, null);
  });

  router.get("/organizations/:organizationId/detail", readRoles, async (req, res) => {
    const organization = await queries.getOrganizationOr404(intId(req, "organizationId"));
    await renderPage(req, res, "organization_detail", { organization });
  });

  router.get("/organizations/:organizationId/edit", writeRoles, async (req, res) => {
    const organization = await queries.getOrganizationOr404(intId(req, "organizationId"));
    await renderOrganizationForm(req, res, organization);
  });

  router.post("/organizations/:organizationId/edit", writeRoles, async (req, res) => {
    const organizationId = intId(req, "organizationId");
    const organization = await queries.getOrganizationOr404(organizationId);

    try {
      await queries.updateOrganization(organizationId, parseOrganizationInput(req));
      flash(req, "success", "Organization updated.");
      res.redirect("/organizations");
      return;
    } catch (exc) {
      flashError(req, "Unable to update organization", exc);
    }

    await renderOrganizationForm(req, res, organization);
  });

  router.post("/organizations/:organizationId/delete", writeRoles, async (req, res) => {
    const organizationId = intId(req, "organizationId");
    const organization = await queries.getOrganizationOr404(organizationId);

    if (await queries.organizationOwnsSites(organizationId)) {
      flash(req, "error", "Unable to delete organization: reassign or delete owned sites first.");
      res.redirect(`/organizations/${organization.id}/edit`);
      return;
    }

    if (await queries.organizationHasResponsibleSystems(organizationId)) {
      flash(
        req,
        "error",
        "Unable to delete organization: remove system ownership references first.",
      );
      res.redirect(`/organizations/${organization.id}/edit`);
      return;
    }

    try {
      await queries.deleteOrganization(organizationId);
      flash(req, "success", "Organization deleted.");
    } catch (exc) {
      flashError(req, "Unable to delete organization", exc);
      res.redirect(`/organizations/${organization.id}/edit`);
      return;
    }

    res.redirect("/organizations");
  });

  // ---- Contacts ------------------------------------------------------------

  router.get("/contacts", readRoles, async (req, res) => {
    const contacts = await queries.listContacts();
    await renderPage(req, res, "contacts_list", { contacts, columns: CONTACT_COLUMNS });
  });

  router.get("/contacts/new", writeRoles, contactFormHandler(null));

  router.post("/contacts/new", writeRoles, async (req, res) => {
    const organizations = await queries.organizationOptions();

    try {
      await queries.createContact(parseContactInput(req));
      flash(req, "success", "Contact created.");
      res.redirect("/contacts");
      return;
    } catch (exc) {
      flashError(req, "Unable to create contact", exc);
    }

    await renderPage(req, res, "contact_form", {
      contact: null,
      organizations,
      form_action: "/contacts/new",
    });
  });

  router.get("/contacts/:contactId/detail", readRoles, async (req, res) => {
    const contact = await queries.getContactOr404(intId(req, "contactId"));
    await renderPage(req, res, "contact_detail", { contact });
  });

  router.get("/contacts/:contactId/edit", writeRoles, contactEditFormHandler());

  router.post("/contacts/:contactId/edit", writeRoles, async (req, res) => {
    const contactId = intId(req, "contactId");
    const contact = await queries.getContactOr404(contactId);
    const organizations = await queries.organizationOptions();

    try {
      await queries.updateContact(contactId, parseContactInput(req));
      flash(req, "success", "Contact updated.");
      res.redirect("/contacts");
      return;
    } catch (exc) {
      flashError(req, "Unable to update contact", exc);
    }

    await renderPage(req, res, "contact_form", {
      contact,
      organizations,
      form_action: `/contacts/${contact.id}/edit`,
    });
  });

  router.post("/contacts/:contactId/delete", writeRoles, async (req, res) => {
    const contactId = intId(req, "contactId");
    const contact = await queries.getContactOr404(contactId);

    try {
      await queries.deleteContact(contactId);
      flash(req, "success", "Contact deleted.");
    } catch (exc) {
      flashError(req, "Unable to delete contact", exc);
      res.redirect(`/contacts/${contact.id}/edit`);
      return;
    }

    res.redirect("/contacts");
  });

  app.use(router);
  for (const extraRouter of build.extraRouters ?? []) {
    app.use(extraRouter);
  }

  // ---- Error handling ------------------------------------------------------

  app.use((req, res) => {
    res.status(404).send(
      "<!doctype html>\n<html>\n<body>\n<h1>Not Found</h1>\n<p>The requested URL was not found on the server. If you entered the URL manually please check your spelling and try again.</p>\n</body>\n</html>\n",
    );
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) {
      // Delegate to Express's default handler when the response already started.
      _next(err);
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status);
      void renderPage(req, res, "error");
      return;
    }
    logger.exception("Unhandled exception", err);
    res.status(500);
    void renderPage(req, res, "error");
  });

  return app;
}

// ---------------------------------------------------------------------------
// Form render helpers
// ---------------------------------------------------------------------------

async function renderOrganizationForm(
  req: Request,
  res: Response,
  organization: queries.OrganizationView | null,
) {
  await renderPage(req, res, "organization_form", {
    organization,
    org_type_options: Object.values(ORGANIZATION_TYPE),
    form_action:
      organization === null ? "/organizations/new" : `/organizations/${organization.id}/edit`,
  });
}

function systemFormHandler(system: null): RequestHandler {
  return async (req, res) => {
    const [sites, organizations, contacts] = await Promise.all([
      queries.siteOptions(),
      queries.organizationOptions(),
      queries.contactOptions(),
    ]);
    await renderPage(req, res, "system_form", {
      system,
      sites,
      organizations,
      contacts,
      installation_statuses: Object.values(INSTALLATION_STATUS),
      form_action: "/systems/new",
    });
  };
}

function systemEditFormHandler(): RequestHandler {
  return async (req, res) => {
    const system = await queries.getSystemOr404(intId(req, "systemId"));
    const [sites, organizations, contacts] = await Promise.all([
      queries.siteOptions(),
      queries.organizationOptions(),
      queries.contactOptions(),
    ]);
    await renderPage(req, res, "system_form", {
      system,
      sites,
      organizations,
      contacts,
      installation_statuses: Object.values(INSTALLATION_STATUS),
      form_action: `/systems/${system.id}/edit`,
    });
  };
}

function siteFormHandler(site: null): RequestHandler {
  return async (req, res) => {
    const [organizations, contacts] = await Promise.all([
      queries.organizationOptions(),
      queries.contactOptions(),
    ]);
    await renderPage(req, res, "site_form", {
      site,
      organizations,
      contacts,
      ownership_options: Object.values(SITE_OWNERSHIP),
      status_options: Object.values(SITE_STATUS),
      form_action: "/sites/new",
    });
  };
}

function siteEditFormHandler(): RequestHandler {
  return async (req, res) => {
    const site = await queries.getSiteOr404(intId(req, "siteId"));
    const [organizations, contacts] = await Promise.all([
      queries.organizationOptions(),
      queries.contactOptions(),
    ]);
    await renderPage(req, res, "site_form", {
      site,
      organizations,
      contacts,
      ownership_options: Object.values(SITE_OWNERSHIP),
      status_options: Object.values(SITE_STATUS),
      form_action: `/sites/${site.id}/edit`,
    });
  };
}

function contactFormHandler(contact: null): RequestHandler {
  return async (req, res) => {
    const organizations = await queries.organizationOptions();
    await renderPage(req, res, "contact_form", {
      contact,
      organizations,
      form_action: "/contacts/new",
    });
  };
}

function contactEditFormHandler(): RequestHandler {
  return async (req, res) => {
    const contact = await queries.getContactOr404(intId(req, "contactId"));
    const organizations = await queries.organizationOptions();
    await renderPage(req, res, "contact_form", {
      contact,
      organizations,
      form_action: `/contacts/${contact.id}/edit`,
    });
  };
}

// ---------------------------------------------------------------------------
// Input parsing (port of the inline form parsing in the Flask view functions)
// ---------------------------------------------------------------------------

function parseSystemInput(req: Request): queries.SystemInput {
  const installationDate = parseDateField(formStringOr(req, "installation_date", ""));
  const warrantyExpiryDate = parseDateField(formStringOr(req, "warranty_expiry_date", ""));

  // Validate installation date is provided
  if (!installationDate) {
    throw new ValidationError("Installation date is required.");
  }

  return {
    name: formString(req, "name").trim(),
    systemType: formString(req, "system_type").trim(),
    description: formStringOr(req, "description").trim(),
    installationDate,
    warrantyExpiryDate,
    installerOrganizationId: formIntOrNull(req, "installer_organization_id"),
    equipmentCondition: formStringOr(req, "equipment_condition").trim() || null,
    status: getEnumByValue(INSTALLATION_STATUS, "InstallationStatus", formString(req, "status")),
    siteId: formRequiredInt(req, "site_id"),
    responsibleOrganizationId: formIntOrNull(req, "responsible_organization_id"),
  };
}

function parseSiteInput(req: Request): queries.SiteInput {
  const longitudeRaw = formStringOr(req, "longitude").trim();
  const latitudeRaw = formStringOr(req, "latitude").trim();

  return {
    siteName: formString(req, "site_name").trim(),
    addressLine1: formString(req, "address_line1").trim(),
    addressLine2: formStringOr(req, "address_line2").trim() || null,
    city: formString(req, "city").trim(),
    state: formString(req, "state").trim(),
    postalCode: formString(req, "postal_code").trim(),
    country: formString(req, "country").trim(),
    buildingCode: formString(req, "building_code").trim(),
    ownership: getEnumByValue(SITE_OWNERSHIP, "SiteOwnership", formString(req, "ownership")),
    status: getEnumByValue(SITE_STATUS, "SiteStatus", formString(req, "status")),
    description: formStringOr(req, "description").trim(),
    longitude: longitudeRaw ? parseDecimalField("Longitude", longitudeRaw) : null,
    latitude: latitudeRaw ? parseDecimalField("Latitude", latitudeRaw) : null,
    roomNumber: formStringOr(req, "room_number").trim() || null,
    ownerOrganizationId: formRequiredInt(req, "owner_organization_id"),
  };
}

function parseOrganizationInput(req: Request): queries.OrganizationInput {
  return {
    name: formString(req, "name").trim(),
    orgType: getEnumByValue(ORGANIZATION_TYPE, "OrganizationType", formString(req, "org_type")),
    description: formStringOr(req, "description").trim(),
  };
}

function parseContactInput(req: Request): queries.ContactInput {
  return {
    firstName: formString(req, "first_name").trim(),
    lastName: formString(req, "last_name").trim(),
    title: formStringOr(req, "title").trim(),
    email: formStringOr(req, "email").trim(),
    phone: formStringOr(req, "phone").trim(),
    organizationId: formRequiredInt(req, "organization_id"),
  };
}
