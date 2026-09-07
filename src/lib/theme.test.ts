import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getStoredTheme,
  isSecretThemeUnlocked,
  recordSecretThemeInput,
  unlockSecretTheme,
} from "./theme.ts";

const storage = new Map<string, string>();
const mockStorage: Storage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => {
    storage.set(key, value);
  },
  removeItem: (key) => {
    storage.delete(key);
  },
  clear: () => {
    storage.clear();
  },
  key: (index) => Array.from(storage.keys())[index] ?? null,
  get length() {
    return storage.size;
  },
};

Object.defineProperty(globalThis, "localStorage", {
  value: mockStorage,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, "window", {
  value: { localStorage: mockStorage },
  configurable: true,
  writable: true,
});

describe("theme secrets", () => {
  it("keeps the secret themes locked by default", () => {
    globalThis.localStorage.setItem("tsuzuku-theme", "void");
    globalThis.localStorage.removeItem("tsuzuku-secret-themes");
    globalThis.localStorage.removeItem("tsuzuku-secret-theme");
    assert.equal(getStoredTheme(), "dark");
    assert.equal(isSecretThemeUnlocked("void"), false);
  });

  it("unlocks a secret theme when the hidden code is entered", () => {
    globalThis.localStorage.removeItem("tsuzuku-theme");
    globalThis.localStorage.removeItem("tsuzuku-secret-themes");
    globalThis.localStorage.removeItem("tsuzuku-secret-theme");

    const unlocked = recordSecretThemeInput("tsuzuku");

    assert.equal(unlocked, "void");
    assert.equal(isSecretThemeUnlocked("void"), true);
    assert.equal(getStoredTheme(), "void");
  });

  it("supports multiple secret themes and passwords", () => {
    const ember = recordSecretThemeInput("foudre");
    const neon = recordSecretThemeInput("neon");
    const aurora = recordSecretThemeInput("aurore");
    const manga = recordSecretThemeInput("mangaka");
    const mono = recordSecretThemeInput("encre");
    const qcSombre = recordSecretThemeInput("qclibre");
    const qcClair = recordSecretThemeInput("duplessis");

    assert.equal(ember, "ember");
    assert.equal(neon, "neon");
    assert.equal(aurora, "aurora");
    assert.equal(manga, "manga");
    assert.equal(mono, "mono");
    assert.equal(qcSombre, "qc-sombre");
    assert.equal(qcClair, "qc-clair");
    assert.equal(isSecretThemeUnlocked("ember"), true);
    assert.equal(isSecretThemeUnlocked("neon"), true);
    assert.equal(isSecretThemeUnlocked("aurora"), true);
    assert.equal(isSecretThemeUnlocked("manga"), true);
    assert.equal(isSecretThemeUnlocked("mono"), true);
    assert.equal(isSecretThemeUnlocked("qc-sombre"), true);
    assert.equal(isSecretThemeUnlocked("qc-clair"), true);
    assert.equal(
      globalThis.localStorage.getItem("tsuzuku-secret-themes"),
      JSON.stringify(["void", "ember", "neon", "aurora", "manga", "mono", "qc-sombre", "qc-clair"]),
    );
  });

  it("allows a manual unlock to persist across reloads", () => {
    unlockSecretTheme("ember");
    assert.equal(isSecretThemeUnlocked("ember"), true);
    assert.equal(JSON.parse(globalThis.localStorage.getItem("tsuzuku-secret-themes") ?? "[]").includes("ember"), true);
  });
});
