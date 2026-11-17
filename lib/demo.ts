import type { AIRequest, AIResponse, BlockKind } from "./types";

export interface DemoStep { topic: string; summary: string; kind: BlockKind; content: string }
export const DEMO_STEPS: DemoStep[] = [
  { topic: "Setting up the equation", summary: "We start with 2x + 6 = 14 and want to find x.", kind: "text", content: "Solve for x" },
  { topic: "Setting up the equation", summary: "We start with 2x + 6 = 14 and want to find x.", kind: "equation", content: "2x + 6 = 14" },
  { topic: "Isolating the variable term", summary: "Subtract 6 from both sides so the x term is alone.", kind: "equation", content: "2x = 8" },
  { topic: "Solving for x", summary: "Divide both sides by 2, then check the answer.", kind: "equation", content: "x = 4" },
  { topic: "Solving for x", summary: "Divide both sides by 2, then check the answer.", kind: "equation", content: "2(4) + 6 = 14 \\checkmark" },
];

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const KNOWN: Record<string, { why: string; simple: string; example: string }> = {
  "2x=8": {
    why: "Subtract 6 from both sides: 2x + 6 − 6 = 14 − 6. The +6 and −6 cancel, leaving 2x = 8. Whatever you do to one side, do to the other so the equation stays balanced.",
    simple: "We took 6 away from both sides. That makes the 6 disappear on the left, so only 2x is left.",
    example: "Think of a balance scale: 2x + 6 on one side, 14 on the other. Remove 6 from each side and the scale stays level.",
  },
  "x=4": {
    why: "2x means 2 times x. Dividing both sides by 2 undoes the multiplying: 2x ÷ 2 = x and 8 ÷ 2 = 4.",
    simple: "Two x's equal 8, so one x equals 4.",
    example: "If 2 identical boxes weigh 8 kg together, one box weighs 4 kg.",
  },
  "2x+6=14": {
    why: "This is the starting equation. The goal is to get x alone using the same operation on both sides.",
    simple: "Some number x, doubled and plus 6, makes 14. We want to find x.",
    example: "Double a number, add 6, and you get 14. Which number?",
  },
};

/** Parse "2x + 6 = 14", "3x = 12", "x = 4" into ax + b = c. */
function parseLinear(list: string[]): { a: number; b: number; c: number } | null {
  for (const raw of list) {
    const s = raw.replace(/\\[a-z]+/gi, "").replace(/\s+/g, "").replace(/[−–]/g, "-");
    const m = s.match(/^(-?\d*\.?\d*)x([+-]\d+\.?\d*)?=(-?\d+\.?\d*)$/);
    if (!m) continue;
    const a = m[1] === "" ? 1 : m[1] === "-" ? -1 : Number(m[1]);
    const b = m[2] ? Number(m[2]) : 0; const c = Number(m[3]);
    if (a !== 0 && [a, b, c].every(Number.isFinite)) return { a, b, c };
  }
  return null;
}
const tex = (a: number, b: number) => `${a === 1 ? "" : a === -1 ? "-" : a}x${b === 0 ? "" : b > 0 ? ` + ${b}` : ` - ${Math.abs(b)}`}`;

function demoTool(r: AIRequest): AIResponse {
  const lin = parseLinear(r.selected);
  if (r.kind === "graph") {
    if (!lin) return { text: "", data: { title: "Demo graph", series: [{ label: "y = x", expr: "x" }, { label: "y = 2", expr: "2" }], xRange: [-5, 5], note: "Demo response: select an equation like 2x + 6 = 14 for a matching graph." }, source: "demo" };
    const x0 = (lin.c - lin.b) / lin.a;
    return { text: "", data: { title: `Each side of ${tex(lin.a, lin.b)} = ${lin.c} as a line`, series: [{ label: `y = ${tex(lin.a, lin.b)}`, expr: `${lin.a}*x${lin.b >= 0 ? "+" : "-"}${Math.abs(lin.b)}` }, { label: `y = ${lin.c}`, expr: String(lin.c) }], xRange: [Math.floor(x0) - 4, Math.ceil(x0) + 4], note: `The lines cross at x = ${Number(x0.toFixed(2))}. That crossing is the solution.` }, source: "demo" };
  }
  if (r.kind === "visual") {
    if (!lin) return { text: "", data: { steps: [{ caption: "Start balanced", left: "?", right: "?" }, { caption: "Do the same to both sides", left: "?", right: "?" }] }, source: "demo" };
    const steps = [{ caption: "Start: both sides are balanced", left: tex(lin.a, lin.b), right: String(lin.c) }];
    if (lin.b !== 0) steps.push({ caption: `${lin.b > 0 ? "Subtract" : "Add"} ${Math.abs(lin.b)} on both sides`, left: tex(lin.a, 0), right: String(lin.c - lin.b) });
    if (lin.a !== 1) steps.push({ caption: `Divide both sides by ${lin.a}`, left: "x", right: String(Number(((lin.c - lin.b) / lin.a).toFixed(3))) });
    return { text: "", data: { steps }, source: "demo" };
  }
  // quiz
  if (lin) {
    const a2 = lin.a + 1, x2 = Math.round((lin.c - lin.b) / lin.a) + 1;
    return { text: "", data: { question: `Practice: solve ${tex(a2, lin.b)} = ${a2 * x2 + lin.b}`, answer: String(x2), hint: `${lin.b === 0 ? "" : `${lin.b > 0 ? "Subtract" : "Add"} ${Math.abs(lin.b)} from both sides, then `}divide by ${a2}.` }, source: "demo" };
  }
  return { text: "", data: { question: "Practice: solve 3x + 2 = 11", answer: "3", hint: "Subtract 2 from both sides, then divide by 3." }, source: "demo" };
}

export function demoRecap(r: AIRequest): AIResponse {
  const lines = r.selected.length ? r.selected : r.context;
  const covered = lines.slice(0, 6).join("; ") || "no notes yet";
  return { text: "", source: "demo", data: {
    recap: `Today's lesson covered: ${covered}. (Demo response: connect the AI key for a written recap.)`,
    keyPoints: lines.slice(0, 5),
    practice: [{ question: "Practice: solve 3x + 2 = 11", answer: "x = 3" }, { question: "Practice: solve 2x - 4 = 10", answer: "x = 7" }, { question: "Practice: solve 5x = 35", answer: "x = 7" }],
    catchup: "Read the notes in order, then try the first practice question and compare your answer with the key.",
    nextTime: "Check which step got the most 'still confused' taps and revisit it.",
  } };
}

export function demoAnswer(r: AIRequest): AIResponse {
  if (r.kind === "recap") return demoRecap(r);
  if (r.kind === "graph" || r.kind === "visual" || r.kind === "quiz") return demoTool(r);
  if (r.image && !r.selected.length) return { text: "Demo response: reading handwriting needs the AI key. With it, Pacer reads what the teacher drew (like 2x = 10) and explains it (x = 5).", source: "demo" };
  const sel = r.selected[0] ?? "";
  const k = KNOWN[norm(sel)];
  if (r.kind === "summarize") {
    const first = (r.selected[0] ?? "New topic").replace(/\\[a-z]+/g, "").trim();
    return { text: "", title: first.split(/\s+/).slice(0, 5).join(" ") || "New topic", summary: "Covers: " + r.selected.join("; ").slice(0, 140), source: "demo" };
  }
  if (r.kind === "catchup") {
    const t = r.topics ?? [];
    const body = t.length ? t.map((x) => `• ${x.title}: ${x.summary}`).join("\n") : "Nothing new yet.";
    return { text: `What changed:\n${body}\n\nRight now the teacher is on "${t[t.length - 1]?.title ?? "the current topic"}".`, source: "demo" };
  }
  if (r.kind === "clarify") return { text: `Suggestion: briefly re-demonstrate "${sel}" with a concrete analogy (like a balance scale) before moving on, then ask for a quick show of hands.`, source: "demo" };
  let body: string;
  if (r.kind === "simplify") body = k?.simple ?? `In simple words: ${sel}. Ask your teacher if the full meaning is still unclear.`;
  else if (r.kind === "example") body = k?.example ?? `Example: try the same idea with easier numbers, then come back to "${sel}".`;
  else if (r.kind === "snip" || r.kind === "deeper") body = (k?.why ?? `This selection is "${sel}".`) + "\n\nDeeper: each step keeps both sides equal, so the answer can always be checked by substituting it back into the original equation.";
  else body = k?.why ?? `You selected "${sel}". With a real AI key configured, you'd get an explanation tailored to the lecture context.`;
  if (r.mode === "guided") body = "Step 1: Look at what changed.\nStep 2: " + body;
  if (r.mode === "focus") body = body.split(/(?<=\.)\s/)[0];
  return { text: body, source: "demo" };
}
