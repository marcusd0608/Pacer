// Smoke test: starts the production server, checks pages, the AI route guards, and one teacher + student round trip.
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = process.env.PORT ?? "3199";
const BASE = `http://localhost:${PORT}`;
const server = spawn("npx", ["next", "start", "-p", PORT], { stdio: "ignore", env: { ...process.env, ANTHROPIC_API_KEY: "", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" } });
const fail = (m) => { console.error("FAIL:", m); server.kill(); process.exit(1); };
const ok = (m) => console.log("ok  ", m);

for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* waiting */ } await new Promise((r) => setTimeout(r, 1000)); if (i === 59) fail("server did not start"); }

for (const [path, text] of [["/", "The classroom"], ["/welcome", "Teach to the room"], ["/privacy", "What Pacer handles"], ["/terms", "Using Pacer"], ["/data-deletion", "Delete or export"]]) {
  const r = await fetch(BASE + path); const t = await r.text();
  if (r.status !== 200 || !t.includes(text)) fail(`${path} -> ${r.status}, missing "${text}"`);
  ok(`${path} loads`);
}

const rnd = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const post = (body, ip = rnd()) => fetch(`${BASE}/api/ai`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
if ((await post({ kind: "nope", mode: "standard", selected: [], context: [] })).status !== 400) fail("bad kind should be 400");
ok("AI route rejects unknown kinds");
const good = { kind: "recap", mode: "standard", selected: ["2x + 6 = 14", "2x = 8"], context: [] };
const res = await post(good, rnd()); const j = await res.json();
if (res.status !== 200 || !j.data?.recap) fail("recap should return a demo recap without a key");
ok("recap returns a result");
let limited = 0; const flood = rnd(); for (let i = 0; i < 30; i++) if ((await post(good, flood)).status === 429) limited++;
if (!limited) fail("rate limit never triggered"); ok(`rate limit triggers (${limited} refused of 30)`);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
const t = await ctx.newPage(); const s = await ctx.newPage(); const errs = [];
t.on("pageerror", (e) => errs.push("teacher: " + e.message)); s.on("pageerror", (e) => errs.push("student: " + e.message));
try {
  await t.goto(BASE); await t.click('button:has-text("Teaching")'); await t.fill("#title", "Smoke lecture"); await t.click('button:has-text("Start Meeting")');
  const code = (await t.locator("p.text-5xl").first().innerText()).trim(); await t.click("text=Enter classroom");
  await t.click('button:has-text("Equation")'); await t.mouse.click(400, 400); await t.waitForTimeout(300); await t.keyboard.type("2x = 8"); await t.mouse.click(900, 600); await t.waitForTimeout(700);
  await s.goto(`${BASE}/room/${code}`); await s.waitForSelector("text=2x", { timeout: 15000 }); ok("student sees the teacher's note");
  await t.fill('input[placeholder^="Ask the class"]', "What is x?"); await t.fill('input[placeholder^="Answer key"]', "4"); await t.click('button:has-text("Ask class")');
  await s.waitForSelector("text=What is x?", { timeout: 10000 });
  await s.fill('input[placeholder="Type your answer"]', "4"); await s.click('button:has-text("Send answer")'); await s.waitForSelector("text=Correct", { timeout: 10000 }); ok("check-in answer is graded");
  await t.click('button:has-text("Post-class package")'); await t.waitForSelector("text=Recap", { timeout: 10000 }); ok("post-class package renders");
} catch (e) { fail(String(e).slice(0, 300)); }
await browser.close();
if (errs.length) fail("page errors: " + errs.join(" | "));
ok("no page errors"); server.kill(); console.log("smoke test passed");
