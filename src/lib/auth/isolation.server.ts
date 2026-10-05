import { getRequest } from "@tanstack/react-start/server";
import { assertSameSiteHeaders, CrossSiteRequestError } from "./same-site.ts";

/**
 * Fetch-Metadata sibling isolation — **server-only** (`.server.ts` suffix).
 *
 * MUST keep the `.server` suffix: this file imports `@tanstack/react-start/server`
 * (`getRequest` → Node `AsyncLocalStorage`). If it is imported from a dual
 * client/server module under a non-`.server` name, Vite ships it to the browser
 * and the app dies with: `AsyncLocalStorage is not a constructor`. The policy
 * itself lives in the pure `./same-site` module, shared with the `/api/*` route
 * handlers that hold their own `Request`.
 *
 * Enforced at the `authMiddleware` chokepoint (see `middleware.ts`). See
 * `./same-site` for the full rationale.
 */
export { CrossSiteRequestError };

/** Throw `CrossSiteRequestError` for a scripted cross-site/sibling request. */
export function assertSameSiteRequest(): void {
  const request = getRequest();
  if (!request) return; // no request context (e.g. build) — nothing to guard
  assertSameSiteHeaders(request.headers, request.method);
}
