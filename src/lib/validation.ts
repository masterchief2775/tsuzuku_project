import { z } from "zod";

/**
 * Shared validation for server functions (replaces 26 hand-rolled validators).
 *
 * `zValidator(schema)` adapts a zod schema to `createServerFn().validator()`:
 * it throws a plain `Error` with the first French message, so client error
 * toasts keep working unchanged. Wire formats are preserved — optional
 * fields stay `undefined` (never coerced), trims/lowercases match the old
 * manual behavior.
 */
export function zValidator<T extends z.ZodType>(schema: T) {
  return (input: unknown): z.infer<T> => {
    const result = schema.safeParse(input);
    if (!result.success) {
      const first = result.error.issues[0];
      throw new Error(first?.message || "Données invalides");
    }
    return result.data;
  };
}

/** Non-string input becomes "" so the `min(1)` French message fires (old behavior). */
export function requiredString(message: string, max = 10_000) {
  return z.preprocess(
    (v) => (typeof v === "string" ? v : ""),
    z.string().trim().min(1, message).max(max, "Valeur trop longue"),
  );
}

/** Trimmed string, `undefined` when absent (for optional fields). */
export function optionalString(max = 10_000) {
  return z.string().trim().max(max).optional();
}

/**
 * Object schema that tolerates `undefined`/`null`/non-object input like the
 * old manual validators did (missing object = missing fields, so required
 * fields still fail with their French message instead of a generic one).
 */
export function lenientObject<T extends z.ZodRawShape>(shape: T) {
  return z.preprocess(
    (v) => (typeof v === "object" && v !== null ? v : {}),
    z.object(shape),
  );
}

export const userIdField = requiredString("Identifiant manquant", 128);
export const requestIdField = requiredString("Identifiant de demande manquant", 128);
export const usernameField = z.preprocess(
  (v) => (typeof v === "string" ? v : ""),
  z.string().trim().toLowerCase().min(1, "Pseudo manquant").max(64),
);
export const messageBodyField = requiredString("Le message ne peut pas être vide", 2000);
export const shareTokenField = requiredString("Token invalide", 256).refine(
  (t) => t.length >= 16,
  { message: "Token invalide" },
);

export { z };
