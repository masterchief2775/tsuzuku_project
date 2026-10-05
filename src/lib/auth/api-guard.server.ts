import { auth, authConfigured } from "./server";
import { assertSameSiteHeaders, CrossSiteRequestError } from "./same-site";

/**
 * Guard for the hand-written `/api/*` route handlers (`createFileRoute(...)({
 * server: { handlers } })`).
 *
 * These are NOT server functions, so they never pass through `authMiddleware` —
 * which is the documented chokepoint for Fetch-Metadata sibling isolation (see
 * `./isolation.server`) and session verification. They must therefore apply both
 * checks themselves, exactly once, here.
 *
 * Every route that writes to the database must go through this: it rejects
 * scripted cross-site / same-site requests (a malicious `*.grok.me` sibling could
 * otherwise ride this app's `SameSite=Lax` session cookie) and resolves the
 * caller from the session, never from a client-supplied id.
 *
 * Returns the verified user id, or a ready-to-return `Response` on rejection —
 * matching the `const idOrRes = …; if (idOrRes instanceof Response) return idOrRes`
 * call style.
 */
export async function requireApiUser(
  request: Request,
): Promise<string | Response> {
  try {
    assertSameSiteHeaders(request.headers, request.method);
  } catch (e) {
    if (e instanceof CrossSiteRequestError) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }
  if (!authConfigured) {
    return Response.json({ error: "Auth disabled" }, { status: 503 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  const id = session?.user?.id;
  if (!id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return id;
}