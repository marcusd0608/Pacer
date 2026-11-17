import { createHash } from "node:crypto";

/**
 * Protects /api/ai from abuse and runaway cost.
 * Uses the shared counter in Supabase when `supabase/launch_readiness.sql` has been applied (works across serverless
 * instances); falls back to a per-instance memory counter otherwise, so it never fails open completely.
 */
const memory = new Map<string, { n: number; reset: number }>();

function memoryHit(key: string, windowSec: number, limit: number): boolean {
  const now = Date.now();
  const cur = memory.get(key);
  if (!cur || cur.reset < now) { memory.set(key, { n: 1, reset: now + windowSec * 1000 }); if (memory.size > 5000) memory.clear(); return true; }
  cur.n += 1;
  return cur.n <= limit;
}

async function remoteHit(key: string, windowSec: number, limit: number): Promise<boolean | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/rate_limit_hit`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: anon, authorization: `Bearer ${anon}` },
      body: JSON.stringify({ p_key: key, p_window_seconds: windowSec, p_limit: limit }),
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) return null;
    const v = await r.json();
    return typeof v === "boolean" ? v : null;
  } catch { return null; }
}

async function hit(key: string, windowSec: number, limit: number): Promise<boolean> {
  const remote = await remoteHit(key, windowSec, limit);
  return remote ?? memoryHit(key, windowSec, limit);
}

export const clientId = (req: Request): string => {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`pacer:${ip}`).digest("hex").slice(0, 24);
};

const num = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

/** Returns null when allowed, or a message when the request should be refused. */
export async function checkAiLimits(req: Request): Promise<string | null> {
  const id = clientId(req);
  const perMinute = num(process.env.AI_LIMIT_PER_MINUTE, 20);
  const perDay = num(process.env.AI_LIMIT_PER_DAY, 400);
  const globalDay = num(process.env.AI_GLOBAL_DAILY_CAP, 6000);
  if (!(await hit(`m:${id}`, 60, perMinute))) return "You're asking very quickly. Please wait a minute and try again.";
  if (!(await hit(`d:${id}`, 86400, perDay))) return "Daily AI limit reached for this device. Please try again tomorrow.";
  if (!(await hit("global", 86400, globalDay))) return "Pacer's AI is at capacity for today. Please try again tomorrow.";
  return null;
}
