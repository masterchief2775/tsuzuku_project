/**
 * Fetch-Metadata sibling isolation — **pure**, no Node / no `@tanstack/react-start`
 * imports, so both worlds can share one policy:
 *   - server functions go through `authMiddleware` -> `assertSameSiteRequest`
 *     (`./isolation.server`), which reads the request off AsyncLocalStorage;
 *   - the hand-written `/api/*` route handlers already HOLD their `Request`, so
 *     they call `assertSameSiteHeaders` directly (see `./api-guard.server`).
 *
 * Do NOT import `@tanstack/react-start/server` here: importing it from a module
 * without a `.server` suffix would ship `AsyncLocalStorage` to the browser and
 * the app dies with: `AsyncLocalStorage is not a constructor`.
 *
 * Apps deployed on `*.grok.me` are "same-site" to each other but MUTUALLY
 * UNTRUSTED, and a `SameSite=Lax` session cookie IS sent on same-site
 * subrequests — so without this, a malicious sibling could make a SCRIPTED
 * (fetch/XHR/form-POST) request to this app and ride this app's session cookie.
 *
 * Allowed: same-origin requests (this app's own client), non-browser requests
 * (SSR / server-to-server, which send no `Sec-Fetch-Site`), and top-level GET
 * navigations (how the OAuth callback and normal page loads arrive). Every
 * cross-site / same-site *scripted* request is rejected. Together with
 * `__Host-` cookies and Better Auth's `trustedOrigins`, this closes the
 * sibling-tenant attack surface.
 */
export class CrossSiteRequestError extends Error {
  readonly status = 403;
  constructor() {
    super("Forbidden: cross-site request blocked");
    this.name = "CrossSiteRequestError";
  }
}

/**
 * Throw `CrossSiteRequestError` when `headers` describe a scripted cross-site /
 * same-site request. Pure and request-agnostic: pass the `Headers` and method of
 * the request you are actually handling.
 */
export function assertSameSiteHeaders(headers: Headers, method: string): void {
  const site = headers.get("sec-fetch-site");
  // Non-browser client (no header), the app's own origin, or a direct
  // (address-bar/bookmark) load are all fine.
  if (!site || site === "same-origin" || site === "none") return;
  // A top-level GET navigation (e.g. the broker's OAuth callback redirect) is
  // fine even when it's cross-site; scripted requests never set navigate mode.
  const dest = headers.get("sec-fetch-dest");
  const isTopLevelGet =
    method === "GET" &&
    headers.get("sec-fetch-mode") === "navigate" &&
    dest !== "object" &&
    dest !== "embed";
  if (isTopLevelGet) return;
  throw new CrossSiteRequestError();
}