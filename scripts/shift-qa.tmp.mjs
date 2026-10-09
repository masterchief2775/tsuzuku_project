import { chromium } from "playwright";

const errors = [];
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
page.setDefaultNavigationTimeout(90000);
page.on("pageerror", (e) => errors.push(`PAGEERROR ${String(e).slice(0, 120)}`));

await page.goto("http://127.0.0.1:8082/?v=list", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const hasNav = await page.locator('nav[aria-label="Navigation principale"]').count();
console.log(`app rendered: ${hasNav > 0}`);
if (hasNav === 0) {
  console.log("AUTH IS ON - aborting, need qa server");
  await browser.close();
  process.exit(2);
}

async function shiftFor(name, openFn) {
  const before = await page.evaluate(() => ({
    mainX: document.querySelector("main")?.getBoundingClientRect().left ?? -1,
    bodyPad: getComputedStyle(document.body).paddingRight,
    bodyOverflow: document.body.style.overflow,
  }));
  await openFn();
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    mainX: document.querySelector("main")?.getBoundingClientRect().left ?? -1,
    bodyPad: getComputedStyle(document.body).paddingRight,
    bodyOverflow: document.body.style.overflow,
  }));
  const dx = (after.mainX - before.mainX).toFixed(2);
  console.log(`${name.padEnd(14)} dx=${dx}px bodyPad=${before.bodyPad}->${after.bodyPad} overflow='${after.bodyOverflow}'`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}

await shiftFor("account", () => page.getByRole("button", { name: /^Compte/ }).click());
await shiftFor("actions", () => page.getByRole("button", { name: /actions de la liste/i }).click());
await shiftFor("suivi", () => page.getByRole("button", { name: /menu suivi/i }).click());
await shiftFor("social", () => page.getByRole("button", { name: /menu social/i }).click());
await shiftFor("bell", () => page.getByRole("button", { name: /notifications/i }).first().click());
await shiftFor("theme", () => page.getByRole("button", { name: /changer le th.m/i }).click());

console.log("errors:", JSON.stringify([...new Set(errors)]));
await browser.close();
