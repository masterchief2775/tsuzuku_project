import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertSameSiteHeaders,
  CrossSiteRequestError,
} from "./same-site.ts";

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

function blocked(headersObj: Headers, method = "POST"): boolean {
  try {
    assertSameSiteHeaders(headersObj, method);
    return false;
  } catch (e) {
    assert.ok(e instanceof CrossSiteRequestError);
    assert.equal(e.status, 403);
    return true;
  }
}

describe("assertSameSiteHeaders", () => {
  it("allows same-origin scripted requests (the app's own client)", () => {
    assert.equal(
      blocked(headers({ "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors" })),
      false,
    );
  });

  it("allows non-browser clients that send no Fetch-Metadata (SSR, server-to-server)", () => {
    assert.equal(blocked(headers({ accept: "application/json" })), false);
  });

  it("allows a top-level cross-site GET navigation (OAuth callback, page loads)", () => {
    assert.equal(
      blocked(
        headers({
          "sec-fetch-site": "cross-site",
          "sec-fetch-mode": "navigate",
          "sec-fetch-dest": "document",
        }),
        "GET",
      ),
      false,
    );
  });

  it("blocks a scripted cross-site request (a malicious same-site sibling)", () => {
    assert.equal(
      blocked(
        headers({
          "sec-fetch-site": "same-site",
          "sec-fetch-mode": "cors",
          "sec-fetch-dest": "empty",
        }),
      ),
      true,
    );
  });

  it("blocks a cross-site form POST (Sec-Fetch-Mode: navigate is not enough)", () => {
    assert.equal(
      blocked(
        headers({
          "sec-fetch-site": "cross-site",
          "sec-fetch-mode": "navigate",
          "sec-fetch-dest": "document",
        }),
        "POST",
      ),
      true,
    );
  });

  it("blocks a navigation that targets an object or an embed", () => {
    for (const dest of ["object", "embed"]) {
      assert.equal(
        blocked(
          headers({
            "sec-fetch-site": "cross-site",
            "sec-fetch-mode": "navigate",
            "sec-fetch-dest": dest,
          }),
          "GET",
        ),
        true,
        `expected dest=${dest} to be blocked`,
      );
    }
  });
});