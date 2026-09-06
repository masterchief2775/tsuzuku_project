import { getSql } from "@/lib/db";

export { isBlockedBetween } from "@/lib/block-guards";

export async function hasBlocked(blocker: string, blocked: string): Promise<boolean> {
  if (!blocker || !blocked || blocker === blocked) return false;
  const sql = await getSql();
  try {
    const rows = await sql<{ n: string }>`
      select count(*)::text as n from "user_block"
      where "blocker_id" = ${blocker} and "blocked_id" = ${blocked}
    `;
    return Number(rows[0]?.n || 0) > 0;
  } catch {
    return false;
  }
}
