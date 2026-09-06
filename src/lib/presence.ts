import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";

export const heartbeatPresence = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const sql = await getSql();
    try {
      await sql`
        insert into "user_presence" ("user_id", "last_seen")
        values (${context.userId}, current_timestamp)
        on conflict ("user_id") do update
        set "last_seen" = current_timestamp
      `;
    } catch {
      // Keep the app usable while an older database is being migrated.
    }
    return { ok: true };
  });
