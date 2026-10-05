import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const API_ROUTES = ["src/routes/api/shared-lists.ts", "src/routes/api/activity.ts"];

test("every /api route authenticates through the shared guard, not a local copy", () => {
  for (const rel of API_ROUTES) {
    const src = read(rel);
    assert.match(
      src,
      /import \{ requireApiUser \} from "@\/lib\/auth\/api-guard\.server"/,
      `${rel} must import the shared guard`,
    );
    // Every handler (GET and POST) resolves the caller through the guard.
    const handlers = src.match(/requireApiUser\(request\)/g) ?? [];
    const handlerDefs = src.match(/^\s*(GET|POST): async/gm) ?? [];
    assert.ok(
      handlers.length >= handlerDefs.length,
      `${rel}: expected a requireApiUser() call in each of ${handlerDefs.length} handlers, found ${handlers.length}`,
    );
    // The vulnerable shape: a hand-rolled session check that skips the
    // Fetch-Metadata isolation guard applied by authMiddleware.
    assert.doesNotMatch(
      src,
      /async function requireUserId/,
      `${rel} must not redefine requireUserId — it bypasses the SameSite guard`,
    );
    assert.doesNotMatch(
      src,
      /auth\.api\.getSession/,
      `${rel} must resolve the session through requireApiUser only`,
    );
  }
});

test("the shared guard enforces both SameSite isolation and a verified session", () => {
  const src = read("src/lib/auth/api-guard.server.ts");
  assert.match(src, /assertSameSiteHeaders\(request\.headers, request\.method\)/);
  assert.match(src, /auth\.api\.getSession\(\{ headers: request\.headers \}\)/);
  // Fail closed: never trust an id from the request body.
  assert.doesNotMatch(src, /body\./);
});

test("toggleVote scopes item_id to the caller's list (no cross-list vote injection)", () => {
  const src = read("src/routes/api/shared-lists.ts");
  const start = src.indexOf('action === "toggleVote"');
  assert.ok(start > -1, "toggleVote action not found");
  const nextAction = src.indexOf('action ===', start + 10);
  const raw = src.slice(start, nextAction === -1 ? src.length : nextAction);
  // Strip comments first: SQL statements are delimited by the template
  // backticks, and prose comments contain backticks of their own.
  const code = raw.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const statements = [...code.matchAll(/sql(?:<[^>]*>)?`([\s\S]*?)`/g)].map((m) => m[1]);

  // Every statement touching shared_list_vote must be scoped by list_id.
  const voteStatements = statements.filter((s) => s.includes('"shared_list_vote"'));
  assert.equal(voteStatements.length, 3, `expected 3 vote statements, found ${voteStatements.length}`);
  for (const stmt of voteStatements) {
    assert.match(stmt, /"list_id" = \$\{listId\}/, `unscoped vote statement:\n${stmt}`);
  }

  // The insert is a SELECT from shared_list_item, so the (item_id, list_id)
  // pair can never disagree — not even if a caller passes a foreign itemId.
  assert.match(code, /insert into "shared_list_vote"/);
  assert.match(code, /select i\."id", \$\{listId\}, \$\{userId\}/);
  assert.match(code, /from "shared_list_item" i/);
  assert.match(code, /where i\."id" = \$\{itemId\} and i\."list_id" = \$\{listId\}/);
  // A foreign item id must fail loudly instead of silently voting.
  assert.match(raw, /inserted\.length/);
});

test("the database also enforces (item_id, list_id) coherence", () => {
  const sql = read("migrations/0019_vote_list_integrity.sql");
  // Purges rows already injected while the API was unscoped…
  assert.match(sql, /delete from "shared_list_vote"/);
  // …and makes the pair a real foreign key so the app cannot reintroduce it.
  assert.match(sql, /foreign key \("item_id", "list_id"\)/);
  assert.match(sql, /references "shared_list_item" \("id", "list_id"\)/);
  assert.match(sql, /create unique index if not exists "shared_list_item_id_list_uidx"/);
});