import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Runs every `scripts/*.test.mjs`.
 *
 * A recursive glob passed to `node --test` is not portable: on Windows the
 * shell does not strip the quotes, and when node does expand a pattern it
 * creates symlinks for test isolation, which needs elevated rights (EPERM).
 * Passing a bare directory is not portable either. Enumerating the files here
 * behaves the same on Windows, macOS and Linux, and keeps the failure mode
 * obvious: a new test file is picked up with no change to package.json.
 */
const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here)
  .filter((f) => f.endsWith(".test.mjs"))
  .sort()
  .map((f) => join(here, f));

if (files.length === 0) {
  console.error("no test files found in scripts/");
  process.exit(1);
}

const res = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
});
process.exit(res.status ?? 1);