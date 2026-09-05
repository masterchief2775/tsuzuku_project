import { getSql } from "@/lib/db";

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
