import { getSql } from "@/lib/db";

/**
 * Per-user action throttle for the hand-written `/api/*` routes.
 *
 * Server functions were protected by their own ad-hoc checks (see
 * `sendFriendRequest` in `lib/friends.ts`); the raw API routes had none, which
 * left the expensive ones open. The worst is `action: "publish"`: it fans out to
 * every friend, and the only guard was a 2-minute de-duplication keyed on
 * `(actor, kind, title)` — so varying the title bypassed it completely and one
 * user could flood every friend's notification feed in a loop.
 *
 * Backed by the database rather than an in-memory map on purpose: these handlers
 * run on serverless instances that scale horizontally, so a per-process counter
 * would be reset by (and shared with) nothing — the limit would depend on which
 * instance answered. One indexed COUNT is negligible next to the fan-out it
 * protects.
 */
type Bucket = {
  /** Human label used in the error message. */
  label: string;
  /** Max calls allowed inside the window. */
  max: number;
  /** Window length, written as a Postgres interval literal. */
  window: string;
};

/**
 * Throws `RateLimitError` (HTTP 429) when the user has exceeded `bucket`.
 * `table`/`column` must be an existing table with a `user_id`-shaped owner
 * column and a `created_at`; callers pass constants, never user input.
 */
export async function enforceRateLimit(input: {
  table: string;
  ownerColumn: string;
  userId: string;
  bucket: Bucket;
}): Promise<void> {
  const { table, ownerColumn, userId, bucket } = input;
  // Identifiers cannot be bound as parameters; these come from the constants
  // above, never from a request body.
  if (!/^[a-z_][a-z0-9_]*$/.test(table) || !/^[a-z_][a-z0-9_]*$/.test(ownerColumn)) {
    throw new Error("enforceRateLimit: identifiant de table/colonne invalide");
  }
  const sql = await getSql();
  let recent = 0;
  try {
    const rows = await sql.query<{ n: string }>(
      // Identifiers cannot be bound; they are the validated constants above.
      `select count(*)::text as n from "${table}"
       where "${ownerColumn}" = $1
         and "created_at" > (current_timestamp - ${bucket.window})`,
      [userId],
    );
    recent = Number(rows[0]?.n || 0);
  } catch (err) {
    // Fail open: an unreachable counter must not take the feature down, and the
    // underlying action still does its own authorisation.
    console.error(`[rate-limit] ${table} indisponible`, err);
    return;
  }
  if (recent >= bucket.max) {
    throw new RateLimitError(bucket.label);
  }
}

export class RateLimitError extends Error {
  readonly status = 429;
  constructor(label: string) {
    super(`Trop d'appels — réessaie dans un instant. (${label})`);
    this.name = "RateLimitError";
  }
}

/** Turns a thrown error into a JSON response, honouring `RateLimitError`. */
export function toErrorResponse(err: unknown): Response | null {
  if (err instanceof RateLimitError) {
    return Response.json({ error: err.message }, { status: 429 });
  }
  return null;
}
