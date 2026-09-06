import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";

export type AdminRole = "user" | "admin";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  createdAt: string;
};

const BOOTSTRAP_ADMIN_EMAIL = "drainix@gmail.com";

function configuredAdminEmail() {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() || null;
}

async function requireAdmin(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ email: string; role: AdminRole }>`
    select "email", "role" from "user" where "id" = ${userId} limit 1
  `;
  const user = rows[0];
  const email = user?.email.toLowerCase();
  const isAdmin =
    user?.role === "admin" ||
    email === BOOTSTRAP_ADMIN_EMAIL ||
    email === configuredAdminEmail();
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
  .validator((input: unknown) => {
    const value = input as { userId?: string; role?: AdminRole } | null;
    if (!value?.userId || (value.role !== "user" && value.role !== "admin")) {
      throw new Error("Paramètres administrateur invalides");
    }
    return { userId: value.userId, role: value.role };
  })
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
  .validator((input: unknown) => {
    const userId = (input as { userId?: string } | null)?.userId?.trim();
    if (!userId) throw new Error("Utilisateur à supprimer manquant");
    return { userId };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdmin(context.userId);
    if (data.userId === context.userId) {
      throw new Error("Tu ne peux pas supprimer ton propre compte depuis l’administration");
    }
    const sql = await getSql();
    await sql`delete from "user" where "id" = ${data.userId}`;
    return { ok: true };
  });
