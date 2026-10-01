import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  lenientObject,
  requiredString,
  usernameField,
  z,
  zValidator,
} from "./validation.ts";

describe("zValidator", () => {
  it("passes valid input through", () => {
    const validate = zValidator(lenientObject({ name: requiredString("Nom requis", 10) }));
    assert.deepEqual(validate({ name: "  Sacha  " }), { name: "Sacha" });
  });
  it("throws the first French message", () => {
    const validate = zValidator(lenientObject({ name: requiredString("Nom requis", 10) }));
    assert.throws(() => validate({}), /Nom requis/);
    assert.throws(() => validate(undefined), /Nom requis/);
    assert.throws(() => validate(null), /Nom requis/);
  });
  it("keeps optional fields undefined", () => {
    const validate = zValidator(lenientObject({ nick: z.string().optional() }));
    assert.deepEqual(validate({}), {});
  });
});

describe("requiredString", () => {
  it("trims and enforces length", () => {
    const validate = zValidator(lenientObject({ body: requiredString("Vide", 5) }));
    assert.deepEqual(validate({ body: " hi " }), { body: "hi" });
    assert.throws(() => validate({ body: "   " }), /Vide/);
    assert.throws(() => validate({ body: 42 }), /Vide/);
    assert.throws(() => validate({ body: "123456" }), /trop longue/);
  });
});

describe("usernameField", () => {
  it("trims and lowercases", () => {
    const validate = zValidator(lenientObject({ username: usernameField }));
    assert.deepEqual(validate({ username: "  SaCha_01 " }), { username: "sacha_01" });
    assert.throws(() => validate({ username: "" }), /Pseudo manquant/);
  });
});
