import type { Request, Response } from "express";

import {
  AUTH_SESSION_KEY,
  AUTH_ID_TOKEN_KEY,
  AUTH_RETURN_TO_KEY,
  type SessionUser,
  type AuthBackend,
  activeSessionRole,
  userRolesFromMemberOf,
  isSafeRedirectTarget,
  isOidcConfigured,
} from "./auth.js";
import { logger } from "./logger.js";
import { flash } from "./helpers.js";

import * as oidc from "openid-client";

const SHIBBOLETH_BASE_URL =
  process.env.SHIBBOLETH_BASE_URL || "https://shibboleth.illinois.edu";
const SHIBBOLETH_LOGOUT_URL =
  process.env.SHIBBOLETH_LOGOUT_URL ||
  "https://shibboleth.illinois.edu/idp/profile/oidc/end-session";

const clientId = () => process.env.SHIBBOLETH_CLIENT_ID || "";
const clientSecret = () => process.env.SHIBBOLETH_CLIENT_SECRET || "";
const baseUrl = () => process.env.BASE_URL || "https://localhost";

let cachedConfig: any = null;

async function getConfiguration() {
  if (cachedConfig) return cachedConfig;
  cachedConfig = await oidc.discovery(
    new URL(`${SHIBBOLETH_BASE_URL}/.well-known/openid-configuration`),
    clientId(),
    undefined,
    oidc.ClientSecretPost(clientSecret()),
  );
  return cachedConfig;
}

export class OIDCAuthBackend implements AuthBackend {
  login(req: Request, res: Response): void {
    if (!isOidcConfigured()) {
      logger.error("Illinois SSO attempted without SHIBBOLETH_CLIENT_ID/SHIBBOLETH_CLIENT_SECRET");
      flash(req, "Single sign-on is not configured for this environment.", "error");
      res.status(500);
      return res.render("error");
    }
    if (req.query.next) {
      const nextStr = typeof req.query.next === "string" ? req.query.next : String(req.query.next);
      if (isSafeRedirectTarget(nextStr, req)) {
        (req.session as any)[AUTH_RETURN_TO_KEY] = nextStr;
      }
    }
    getConfiguration()
      .then(async (config: any) => {
        const redirectTo = await oidc.buildAuthorizationUrl(config, {
          redirect_uri: `${baseUrl()}/auth/callback`,
          scope: "openid profile email",
          claims: JSON.stringify({
            id_token: {
              preferred_username: { essential: true },
              uiucedu_is_member_of: { essential: true },
            },
          }),
        });
        res.redirect(String(redirectTo));
      })
      .catch((err: unknown) => {
        logger.error("Unable to start OIDC login", err);
        flash(req, "Unable to complete login", "error");
        res.status(500);
        res.render("error");
      });
  }

  async authCallback(req: Request, res: Response): Promise<void> {
    try {
      const config = await getConfiguration();
      const url = req.protocol + "://" + req.get("host") + req.originalUrl;
      const tokens = await oidc.authorizationCodeGrant(config, new URL(url), undefined);
      const claims: any = await oidc.fetchUserInfo(config, tokens.access_token as string, oidc.skipSubjectCheck);
      const netid = claims?.preferred_username;
      if (!netid) throw new Error("The identity provider did not return a NetID.");

      const mappedRoles = userRolesFromMemberOf(claims?.uiucedu_is_member_of);
      const activeRole = activeSessionRole({ netid, roles: mappedRoles, role: null });
      const sessionUser: SessionUser = { netid, roles: mappedRoles, role: activeRole };
      (req.session as any)[AUTH_SESSION_KEY] = sessionUser;
      (req.session as any)[AUTH_ID_TOKEN_KEY] = (tokens as any).id_token || "";
      return res.redirect(popPostLoginRedirect(req));
    } catch (exc) {
      logger.error("Unable to complete login", exc);
      delete (req.session as any)[AUTH_SESSION_KEY];
      delete (req.session as any)[AUTH_ID_TOKEN_KEY];
      delete (req.session as any)[AUTH_RETURN_TO_KEY];
      flash(req, "Unable to complete login", "error");
      res.status(500);
      res.render("error");
    }
  }

  logoutRedirectUrl(): string | null {
    const params = new URLSearchParams();
    params.set("post_logout_redirect_uri", `${baseUrl()}/login`);
    return `${SHIBBOLETH_LOGOUT_URL}?${params.toString()}`;
  }
}

function popPostLoginRedirect(req: Request): string {
  const session = req.session as any;
  const target = session[AUTH_RETURN_TO_KEY];
  delete session[AUTH_RETURN_TO_KEY];
  return isSafeRedirectTarget(target, req) ? target : "/";
}