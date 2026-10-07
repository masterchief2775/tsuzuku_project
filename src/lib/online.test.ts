import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initialOnline } from "./online.ts";

describe("initialOnline", () => {
  it("treats an explicit offline navigator as offline", () => {
    assert.equal(initialOnline({ onLine: false }), false);
  });

  it("treats an online navigator as online", () => {
    assert.equal(initialOnline({ onLine: true }), true);
  });

  it("assumes online when there is no navigator (server render)", () => {
    assert.equal(initialOnline(undefined), true);
    assert.equal(initialOnline(null), true);
  });

  it("assumes online when onLine is missing, as it is on Node 21+", () => {
    // Node exposes a global `navigator` with no `onLine`. Reading that as
    // offline baked a false "hors-ligne" banner into the SSR HTML and broke
    // hydration on every load.
    assert.equal(initialOnline({}), true);
    assert.equal(initialOnline({ onLine: undefined }), true);
    assert.equal(initialOnline(globalThis.navigator), true);
  });
});