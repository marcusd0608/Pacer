"use client";
import { useEffect, useState } from "react";
import { askAI } from "@/lib/ai";
import { track } from "@/lib/track";
import type { RoomState } from "@/lib/types";

interface Recap { recap: string; keyPoints: string[]; practice: { question: string; answer: string }[]; catchup: string; nextTime: string }

const toMarkdown = (title: string, r: Recap) =>
  `# ${title}: class recap\n\n${r.recap}\n\n## Key points\n${r.keyPoints.map((p) => `- ${p}`).join("\n")}\n\n## Practice\n${r.practice.map((p, i) => `${i + 1}. ${p.question}\n   Answer: ${p.answer}`).join("\n")}\n\n## If you missed class\n${r.catchup}\n\n## Teacher note\n${r.nextTime}\n`;

/** One click after class: recap, practice, catch-up note and a teacher follow-up note. Copy or download as Markdown. */
export function PostClassSheet({ state, onClose }: { state: RoomState; onClose: () => void }) {
  const [data, setData] = useState<Recap | null>(null);
  const [source, setSource] = useState<"ai" | "demo">("ai");
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setBusy(true); setErr("");
    const lines = [...(state.archive ?? []).flatMap((a) => a.blocks), ...state.blocks].filter((b) => b.kind === "text" || b.kind === "equation" || b.kind === "sticky").map((b) => b.content).filter(Boolean);
    try {
      const r = await askAI({ kind: "recap", mode: "standard", selected: lines.slice(0, 40), context: [], topicTitle: state.title, topics: state.topics.map((t) => ({ title: t.title, summary: t.summary })) });
      const d = r.data as Partial<Recap> | undefined;
      if (!d || typeof d.recap !== "string") throw new Error("The AI didn't return a recap. Please try again");
      setData({ recap: d.recap, keyPoints: d.keyPoints ?? [], practice: (d.practice ?? []).slice(0, 3), catchup: d.catchup ?? "", nextTime: d.nextTime ?? "" });
      setSource(r.source); track("recap", "teacher", state.code);
    } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  };
  useEffect(() => { void run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const md = data ? toMarkdown(state.title, data) : "";
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <aside role="dialog" aria-label="Post-class package" className="h-full w-[min(520px,100vw)] overflow-y-auto bg-eggshell p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="display text-3xl">Post-class package</h2><button className="btn btn-outline btn-sm" onClick={onClose}>Done</button></div>
        <p className="mt-2 text-sm text-smoke">A recap, practice questions and a catch-up note built from this lecture, ready to paste into an email or your LMS. Review it before you share it.</p>
        {busy && <p role="status" className="mt-6 text-smoke">Writing the recap…</p>}
        {err && <p role="alert" className="mt-6 text-sm text-sky-deep">{err} <button className="underline" onClick={() => void run()}>Try again</button></p>}
        {data && (
          <div className="mt-5 space-y-5">
            <p className="text-xs text-smoke">{source === "demo" ? "Demo response (no AI key set)" : "Written by AI from your lecture notes. Check it for accuracy."}</p>
            <section><h3 className="text-sm font-medium">Recap</h3><p className="mt-1 whitespace-pre-wrap">{data.recap}</p></section>
            {data.keyPoints.length > 0 && <section><h3 className="text-sm font-medium">Key points</h3><ul className="mt-1 list-disc space-y-1 pl-5">{data.keyPoints.map((p, i) => <li key={i}>{p}</li>)}</ul></section>}
            {data.practice.length > 0 && <section><h3 className="text-sm font-medium">Practice</h3><ol className="mt-1 list-decimal space-y-2 pl-5">{data.practice.map((p, i) => <li key={i}>{p.question}<br /><span className="text-sm text-smoke">Answer: {p.answer}</span></li>)}</ol></section>}
            {data.catchup && <section><h3 className="text-sm font-medium">If you missed class</h3><p className="mt-1">{data.catchup}</p></section>}
            {data.nextTime && <section className="rounded-2xl bg-sky-soft p-3"><h3 className="text-sm font-medium">Teacher note (not for students)</h3><p className="mt-1 text-sm">{data.nextTime}</p></section>}
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary btn-sm" onClick={() => { void navigator.clipboard?.writeText(md).then(() => setCopied(true)); }}>{copied ? "Copied" : "Copy as text"}</button>
              <a className="btn btn-outline btn-sm" href={`data:text/markdown;charset=utf-8,${encodeURIComponent(md)}`} download={`${state.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "lecture"}-recap.md`}>Download .md</a>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
