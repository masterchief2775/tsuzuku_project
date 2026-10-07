import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  asksForCertificateCheck,
  needsTls,
  rejectUnauthorized,
  sslModeOf,
} from "./pg-ssl.ts";

const url = (sslmode?: string) =>
  sslmode
    ? `postgresql://u:p@db.example.com:5432/db?sslmode=${sslmode}`
    : "postgresql://u:p@db.example.com:5432/db";

describe("pg-ssl", () => {
  it("reads the explicit mode, case-insensitively", () => {
    assert.equal(sslModeOf(url("require")), "require");
    assert.equal(sslModeOf("postgresql://x/db?SSLMODE=Verify-Full"), "verify-full");
    assert.equal(sslModeOf(url()), null);
  });

  it("verifies the certificate for an explicit verify-full", () => {
    // The regression this guards: verify-full used to map to
    // rejectUnauthorized:false, i.e. asking for verification got none.
    assert.equal(asksForCertificateCheck(url("verify-full")), true);
    assert.equal(rejectUnauthorized(url("verify-full")), true);
  });

  it("does NOT verify for the encrypt-only modes", () => {
    for (const mode of ["require", "prefer", "verify-ca"]) {
      assert.equal(
        asksForCertificateCheck(url(mode)),
        false,
        `sslmode=${mode} must not enable certificate verification`,
      );
      assert.equal(needsTls(url(mode)), true, `sslmode=${mode} must still use TLS`);
    }
  });

  it("keeps the previous lenient default for a known host with no explicit mode", () => {
    // Changing this would break deployments that rely on the old behaviour.
    const neon = "postgresql://u:p@ep-cool.us-east.aws.neon.tech/db?sslmode=require";
    assert.equal(needsTls(neon), true);
    assert.equal(rejectUnauthorized(neon), false);

    const bare = "postgresql://u:p@ep-cool.us-east.aws.neon.tech/db";
    assert.equal(needsTls(bare), true);
    assert.equal(rejectUnauthorized(bare), false);
  });

  it("leaves a plain local Postgres alone", () => {
    assert.equal(needsTls(url()), false);
    assert.equal(rejectUnauthorized(url()), false);
  });
});