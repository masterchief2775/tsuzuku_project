import { getSql } from "@/lib/db";

/**
 * Raw block check, safe to import from client-bundled modules (unlike
 * lib/blocks.server.ts, which TanStack Start's import-protection refuses to
 * let a client-bundled file pull in — see lib/messages.ts for why this
 * exists instead of importing that one directly).
 */
export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  if (!a || !b || a === b) return false;
  const sql = await getSql();
  try {
    const rows = await sql<{ n: string }>`
      select count(*)::text as n from "user_block"
      where
        ("blocker_id" = ${a} and "blocked_id" = ${b})
        or ("blocker_id" = ${b} and "blocked_id" = ${a})
    `;
    return Number(rows[0]?.n || 0) > 0;
  } catch {
    return false;
  }
}
