import { NextResponse } from "next/server";
import { demoAnswer } from "@/lib/demo";
import { buildJson, buildSummarize, buildUser, JSON_KINDS, SYSTEM } from "@/lib/prompt";
import { checkAiLimits } from "@/lib/rateLimit";
import type { AIKind, AIRequest, AIResponse, Mode } from "@/lib/types";

const KINDS: AIKind[] = ["explain", "why", "simplify", "example", "snip", "followup", "another", "summarize", "catchup", "deeper", "clarify", "graph", "visual", "quiz", "recap"];
const MODES: Mode[] = ["standard", "focus", "guided", "example"];
const MAX_BODY = 1_200_000;

const clip = (a: string[] | undefined, n: number) => (a ?? []).slice(0, n).map((s) => String(s).slice(0, 600));

export async function POST(req: Request) {
  let b: AIRequest;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ text: "", source: "demo", error: "Request too large" }, { status: 413 });
  try { b = (await req.json()) as AIRequest; } catch { return NextResponse.json({ text: "", source: "demo", error: "Bad request" }, { status: 400 }); }
  if (!b || !KINDS.includes(b.kind) || !MODES.includes(b.mode) || !Array.isArray(b.selected) || !Array.isArray(b.context)) return NextResponse.json({ text: "", source: "demo", error: "Bad request" }, { status: 400 });
  const limited = await checkAiLimits(req);
  if (limited) return NextResponse.json({ text: "", source: "demo", error: limited }, { status: 429, headers: { "retry-after": "60" } });
  b = { ...b, image: typeof b.image === "string" ? b.image : undefined, selected: clip(b.selected, 12), context: clip(b.context, 40), question: b.question?.slice(0, 500), topicTitle: b.topicTitle?.slice(0, 200), stats: b.stats?.slice(0, 400), history: (b.history ?? []).filter((h) => typeof h.text === "string" && h.text.trim()).slice(-6) };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json(demoAnswer(b));
  try {
    const img = b.image && b.image.length < 800_000 ? /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(b.image) : null;
    const prompt = b.kind === "summarize" ? buildSummarize(b) : JSON_KINDS.includes(b.kind) ? buildJson(b) : buildUser(b);
    while (b.history?.length && b.history[0].role !== "user") b.history = b.history.slice(1);
    const messages = [...(b.history ?? []).map((h) => ({ role: h.role, content: h.text })), { role: "user" as const, content: img ? [{ type: "image", source: { type: "base64", media_type: img[1], data: img[2] } }, { type: "text", text: prompt }] : prompt }];
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: JSON_KINDS.includes(b.kind) ? 1600 : b.detail === "long" ? 1400 : 1000, system: SYSTEM, messages }),
    });
    if (!r.ok) throw new Error(`AI provider returned ${r.status}`);
    // The reply can start with a "thinking" block; the answer is in the text block(s).
    const j = (await r.json()) as { content?: { type?: string; text?: string }[]; stop_reason?: string };
    const text = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
    if (!text) throw new Error("The AI didn't return an answer. Please try again");
    if (b.kind === "summarize") {
      try { const o = JSON.parse(text.replace(/^```json|```$/g, "").trim()); if (typeof o.title !== "string" || !o.title.trim() || typeof o.summary !== "string") throw new Error("Invalid topic summary"); return NextResponse.json({ text: "", title: o.title, summary: o.summary, newTopic: o.newTopic === true, source: "ai" } satisfies AIResponse); }
      catch { return NextResponse.json(demoAnswer(b)); }
    }
    if (JSON_KINDS.includes(b.kind)) {
      try { const data = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim()); return NextResponse.json({ text: "", data, source: "ai" } satisfies AIResponse); }
      catch { return NextResponse.json(demoAnswer(b)); }
    }
    return NextResponse.json({ text, source: "ai" } satisfies AIResponse);
  } catch (e) {
    return NextResponse.json({ text: "", source: "ai", error: e instanceof Error ? e.message : "AI request failed" } satisfies AIResponse, { status: 502 });
  }
}
