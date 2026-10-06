import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHELL = "src/components/tsuzuku/app-shell.tsx";
const src = readFileSync(join(ROOT, SHELL), "utf8");

/** `const Name = lazy(() => import("…/x").then((m) => ({ default: m.Name })));` */
function lazyBindings() {
  const out = [];
  const re =
    /const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*"@\/components\/tsuzuku\/([\w.-]+)"\s*\)[\s\S]*?default:\s*m\.(\w+)\s*\}/g;
  for (const m of src.matchAll(re)) {
    out.push({ local: m[1], module: m[2], exportName: m[3] });
  }
  return out;
}

/** Character ranges covered by a <Suspense>…</Suspense> element. */
function suspenseRanges() {
  const ranges = [];
  const open = /<Suspense\b/g;
  let m;
  while ((m = open.exec(src)) !== null) {
    const close = src.indexOf("</Suspense>", m.index);
    if (close === -1) break;
    ranges.push([m.index, close]);
    open.lastIndex = close;
  }
  return ranges;
}

test("every code-split view resolves a real named export", () => {
  const bindings = lazyBindings();
  assert.ok(bindings.length > 0, "expected at least one lazy() view in the shell");

  for (const { module, exportName } of bindings) {
    const mod = readFileSync(
      join(ROOT, "src/components/tsuzuku", `${module}.tsx`),
      "utf8",
    );
    const exported =
      new RegExp(
        `export\\s+(?:async\\s+)?(?:function|const|class)\\s+${exportName}\\b`,
      ).test(mod) || new RegExp(`export\\s+default\\s+`).test(mod);
    assert.ok(
      exported,
      `${module}.tsx has no export named "${exportName}" — the lazy() import would resolve to undefined and blank the view`,
    );
  }
});

test("the local binding name matches the module export", () => {
  for (const { local, exportName } of lazyBindings()) {
    assert.equal(local, exportName, `lazy binding "${local}" should mirror "${exportName}"`);
  }
});

test("every lazily-loaded view is rendered inside a Suspense boundary", () => {
  const ranges = suspenseRanges();
  assert.ok(ranges.length > 0, "no <Suspense> boundary found in the shell");

  for (const { local } of lazyBindings()) {
    const usage = new RegExp(`<${local}[\\s/>]`).exec(src);
    assert.ok(usage, `${local} is lazy() but never rendered`);
    const inside = ranges.some(([a, b]) => usage.index >= a && usage.index <= b);
    assert.ok(
      inside,
      `<${local}> is rendered outside any <Suspense> boundary — React would crash instead of showing the fallback`,
    );
  }
});

test("the landing view stays eager so the first paint is not blocked", () => {
  const lazyNames = new Set(lazyBindings().map((b) => b.local));
  const eager = [
    ["Dashboard", "dashboard"],
    ["ListView", "list-view"],
    ["ProfileView", "profile-view"],
  ];
  for (const [name, module] of eager) {
    assert.ok(!lazyNames.has(name), `${name} is the landing view and must stay eager`);
    assert.match(
      src,
      new RegExp(`import \\{ ${name} \\} from "@/components/tsuzuku/${module}"`),
      `${name} should be a static import`,
    );
  }
});