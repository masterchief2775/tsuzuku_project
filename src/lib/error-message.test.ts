import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { friendlyErrorMessage } from "./error-message.ts";

describe("friendlyErrorMessage", () => {
  it("translates 5xx statuses into a retryable message", () => {
    assert.equal(
      friendlyErrorMessage(new Error("Erreur 503"), "fallback"),
      "Le service est momentanément indisponible. Réessaie dans un instant.",
    );
  });

  it("translates a disabled auth backend the same way", () => {
    assert.equal(
      friendlyErrorMessage(new Error("Auth disabled"), "fallback"),
      "Le service est momentanément indisponible. Réessaie dans un instant.",
    );
  });

  it("translates network failures", () => {
    assert.equal(
      friendlyErrorMessage(new TypeError("Failed to fetch"), "fallback"),
      "Pas de connexion au serveur. Vérifie ton réseau puis réessaie.",
    );
  });

  it("translates expired sessions", () => {
    assert.equal(
      friendlyErrorMessage(new Error("Erreur 401"), "fallback"),
      "Ta session a expiré. Reconnecte-toi puis réessaie.",
    );
  });

  it("passes human messages through untouched", () => {
    assert.equal(
      friendlyErrorMessage(new Error("Ce pseudo est déjà pris"), "fallback"),
      "Ce pseudo est déjà pris",
    );
  });

  it("falls back when there is nothing usable", () => {
    assert.equal(friendlyErrorMessage(null, "fallback"), "fallback");
    assert.equal(friendlyErrorMessage(new Error("   "), "fallback"), "fallback");
  });
});
