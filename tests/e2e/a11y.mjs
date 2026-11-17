// Automated accessibility scan (axe-core). Fails on serious or critical violations.
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const PORT = process.env.PORT ?? "3198";
const BASE = `http://localhost:${PORT}`;
const server = spawn("npx", ["next", "start", "-p", PORT], { stdio: "ignore", env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" } });
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* waiting */ } await new Promise((r) => setTimeout(r, 1000)); }
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
let bad = 0;
const scan = async (page, name) => {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  for (const v of violations) { console.log(`${v.impact.padEnd(8)} ${name}: ${v.id} (${v.nodes.length}) ${v.help}`); if (v.impact === "serious" || v.impact === "critical") bad++; }
  if (!violations.length) console.log(`clean    ${name}`);
};
const page = await ctx.newPage();
for (const p of ["/", "/welcome", "/privacy", "/terms", "/data-deletion"]) { await page.goto(BASE + p); await page.waitForTimeout(500); await scan(page, p); }
await page.goto(BASE); await page.click('button:has-text("Teaching")'); await page.fill("#title", "A11y lecture"); await page.click('button:has-text("Start Meeting")');
const code = (await page.locator("p.text-5xl").first().innerText()).trim(); await page.click("text=Enter classroom"); await page.waitForTimeout(800); await scan(page, "classroom (teacher)");
const stu = await ctx.newPage(); await stu.goto(`${BASE}/room/${code}`); await stu.waitForTimeout(2500); await scan(stu, "classroom (student)");
await browser.close(); server.kill();
console.log(bad ? `\n${bad} serious/critical issue types` : "\nno serious or critical issues");
process.exit(bad ? 1 : 0);
