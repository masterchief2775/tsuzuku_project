import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "msedge" });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page.goto("http://127.0.0.1:8082/?v=list", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
console.log("title:", await page.title());
console.log("h1:", JSON.stringify(await page.locator("h1").first().textContent().catch(() => null)));
console.log("vite-flag:", await page.evaluate(() => document.documentElement.outerHTML.slice(0, 200)));
await browser.close();
