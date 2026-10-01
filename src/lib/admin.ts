import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { lenientObject, requiredString, userIdField, z, zValidator } from "@/lib/validation";

const setRoleInput = lenientObject({
  userId: userIdField,
  role: z.enum(["user", "admin"], { message: "Paramètres administrateur invalides" }),
});
const deleteUserInput = lenientObject({
  userId: requiredString("Utilisateur à supprimer manquant", 128),
});

export type AdminRole = "user" | "admin";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  createdAt: string;
};

/**
 * Extra admin grant beyond the `role` column, from the `ADMIN_EMAIL` env var
 * only. There used to be a hardcoded bootstrap email here — removed: it
 * leaked the owner's address in the public repo and re-granted admin on every
 * sign-in even after the DB role was revoked. The durable grant is
 * `user.role = 'admin'` (see `migrations/0012_admin_roles.sql` + `setAdminRole`
 * below); `ADMIN_EMAIL` is just the break-glass override. Set it in Vercel →
 * Environment Variables.
 */
function configuredAdminEmail() {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() || null;
}

async function requireAdmin(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ email: string | null; role: AdminRole }>`
    select "email", "role" from "user" where "id" = ${userId} limit 1
  `;
  const user = rows[0];
  const email = user?.email?.toLowerCase() ?? null;
  const isAdmin =
    user?.role === "admin" ||
    (email != null && email === configuredAdminEmail());
  if (!isAdmin) throw new Error("Accès administrateur refusé");
  return user;
}

export const getAdminStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ isAdmin: boolean }> => {
    try {
      await requireAdmin(context.userId);
      return { isAdmin: true };
    } catch {
      return { isAdmin: false };
    }
  });

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminUser[]> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      name: string;
      email: string;
      role: AdminRole;
      created_at: string | Date;
    }>`
      select "id", "name", "email", "role", "createdAt" as created_at
      from "user"
      order by "createdAt" desc
      limit 500
    `;
    return rows.map((row) => ({
      ...row,
      createdAt: typeof row.created_at === "string" ? row.created_at : row.created_at.toISOString(),
    }));
  });

export const setAdminRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zValidator(setRoleInput))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdmin(context.userId);
    if (data.userId === context.userId && data.role === "user") {
      throw new Error("Tu ne peux pas retirer tes propres droits administrateur");
    }
    const sql = await getSql();
    await sql`
      update "user" set "role" = ${data.role}, "updatedAt" = current_timestamp
      where "id" = ${data.userId}
    `;
    return { ok: true };
  });

export const deleteAdminUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zValidator(deleteUserInput))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdmin(context.userId);
    if (data.userId === context.userId) {
      throw new Error("Tu ne peux pas supprimer ton propre compte depuis l’administration");
    }
    const sql = await getSql();
    await sql`delete from "user" where "id" = ${data.userId}`;
    return { ok: true };
  });
