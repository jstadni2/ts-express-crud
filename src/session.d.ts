import type { SessionUser } from "./auth.js";
import type { FlashMessage } from "./helpers.js";

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
    oidc_id_token?: string;
    post_login_redirect?: string;
    _flashes?: FlashMessage[];
    _csrf_token?: string;
    oidc_state?: string;
    oidc_nonce?: string;
  }
}
