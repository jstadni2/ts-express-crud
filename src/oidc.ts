import * as oidc from "openid-client";
import type { Request, Response } from "express";
import {
  AUTH_RETURN_TO_KEY,
  isSafeRedirectTarget,
  loginClaims,
  type AuthBackend,
  type AuthCallbackResult,
  type SessionUser,
  activeSessionRole,
  userRolesFromMemberOf,
} from "./auth.js";
import { flash } from "./helpers.js";
import { logger } from "./logger.js";
import { renderPage } from "./views.js";

function shibbolethBaseUrl(): string {
  return process.env.SHIBBOLETH_BASE_URL ?? "https://shibboleth.illinois.edu";
}

function shibbolethLogoutUrl(): string {
  return (
    process.env.SHIBBOLETH_LOGOUT_URL ??
    "https://shibboleth.illinois.edu/idp/profile/oidc/end-session"
  );
}

function clientId(): string | undefined {
  const value = process.env.SHIBBOLETH_CLIENT_ID;
  return value && value.trim() !== "" ? value : undefined;
}

function clientSecret(): string | undefined {
  const value = process.env.SHIBBOLETH_CLIENT_SECRET;
  return value && value.trim() !== "" ? value : undefined;
}

function isOidcConfigured(): boolean {
  return clientId() !== undefined && clientSecret() !== undefined;
}

function callbackUrl(req: Request): string {
  const host = req.get("host") ?? "localhost";
  return `${req.protocol}://${host}/auth/callback`;
}

function indexUrl(req: Request): string {
  const host = req.get("host") ?? "localhost";
  return `${req.protocol}://${host}/`;
}

let discoveryPromise: Promise<oidc.Configuration> | null = null;

/** Discover (and cache) the IdP metadata. Discovery defaults to
 * `client_secret_post`, matching the Flask app's authlib configuration. */
function configuration(): Promise<oidc.Configuration> {
  discoveryPromise ??= oidc.discovery(
    new URL(`${shibbolethBaseUrl()}/.well-known/openid-configuration`),
    clientId()!,
    clientSecret()!,
  );
  return discoveryPromise;
}

/**
 * Port of `OIDCAuthBackend` from `src/app.py`: Illinois Shibboleth OIDC
 * login/logout flow with AuthMan role mapping.
 */
export class OidcAuthBackend implements AuthBackend {
  async login(req: Request, res: Response): Promise<void> {
    if (!isOidcConfigured()) {
      logger.error(
        "Illinois SSO attempted without SHIBBOLETH_CLIENT_ID/SHIBBOLETH_CLIENT_SECRET",
      );
      flash(req, "error", "Single sign-on is not configured for this environment.");
      res.status(500);
      await renderPage(req, res, "error");
      return;
    }

    const next = req.query.next;
    if (typeof next === "string" && isSafeRedirectTarget(req, next)) {
      req.session[AUTH_RETURN_TO_KEY] = next;
    }

    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    req.session.oidc_state = state;
    req.session.oidc_nonce = nonce;

    const config = await configuration();
    const authorizationUrl = oidc.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl(req),
      scope: "openid profile email",
      state,
      nonce,
      claims: loginClaims(),
    });
    res.redirect(authorizationUrl.href);
  }

  async authCallback(req: Request): Promise<AuthCallbackResult> {
    const config = await configuration();
    const currentUrl = new URL(`${req.protocol}://${req.get("host")}${req.originalUrl}`);
    const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      expectedState: req.session.oidc_state,
      expectedNonce: req.session.oidc_nonce,
    });
    delete req.session.oidc_state;
    delete req.session.oidc_nonce;

    const idTokenClaims = (tokens.claims() ?? {}) as Record<string, unknown>;
    let userinfo: Record<string, unknown> = {};
    if (tokens.access_token) {
      try {
        userinfo = (await oidc.fetchUserInfo(
          config,
          tokens.access_token,
          typeof idTokenClaims.sub === "string" ? idTokenClaims.sub : oidc.skipSubjectCheck,
        )) as Record<string, unknown>;
      } catch (exc) {
        logger.warn("Unable to fetch userinfo; falling back to ID token claims", exc);
      }
    }

    const netid =
      (typeof userinfo.preferred_username === "string" && userinfo.preferred_username) ||
      (typeof idTokenClaims.preferred_username === "string" && idTokenClaims.preferred_username);
    if (!netid) {
      throw new Error("The identity provider did not return a NetID.");
    }

    const mappedRoles = userRolesFromMemberOf(
      userinfo.uiucedu_is_member_of ?? idTokenClaims.uiucedu_is_member_of,
    );
    const sessionUser: SessionUser = {
      netid,
      roles: mappedRoles,
      role: activeSessionRole({ netid, roles: mappedRoles }),
    };

    return { sessionUser, idToken: tokens.id_token ?? "" };
  }

  /** Port of `logout_redirect_url`: Illinois end-session with a return link. */
  logoutRedirectUrl(req: Request): string | null {
    const url = new URL(shibbolethLogoutUrl());
    url.searchParams.set("post_logout_redirect_uri", indexUrl(req));
    return url.href;
  }
}
