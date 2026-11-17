import { test } from "node:test";
import assert from "node:assert/strict";

delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
process.env.AI_LIMIT_PER_MINUTE = "3";
const { checkAiLimits, clientId } = await import("../lib/rateLimit.ts");

const req = (ip) => new Request("http://x/api/ai", { method: "POST", headers: { "x-forwarded-for": ip } });

test("the same client is refused after the per-minute limit", async () => {
  for (let i = 0; i < 3; i++) assert.equal(await checkAiLimits(req("203.0.113.7")), null);
  assert.match(await checkAiLimits(req("203.0.113.7")) ?? "", /wait a minute/i);
});

test("a different client is not affected", async () => {
  assert.equal(await checkAiLimits(req("198.51.100.9")), null);
});

test("client ids are hashed, not raw addresses", () => {
  const id = clientId(req("203.0.113.7"));
  assert.ok(!id.includes("203"));
  assert.equal(id.length, 24);
});
