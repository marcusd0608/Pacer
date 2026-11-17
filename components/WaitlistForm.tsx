"use client";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase";

export function WaitlistForm() {
  const [email, setEmail] = useState(""); const [role, setRole] = useState("teacher"); const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setState("sending");
    const sb = getSupabase();
    if (!sb) { setState("error"); return; }
    const { error } = await sb.from("waitlist").insert({ email: email.trim(), role, note: note.trim() || null });
    setState(!error || error.code === "23505" ? "done" : "error"); // 23505 = already on the list
  };
  if (state === "done") return <p role="status" className="rounded-2xl bg-sky-soft p-4 text-center">You&apos;re on the list. We&apos;ll email you when your spot opens.</p>;
  return (
    <form onSubmit={submit} className="space-y-3 text-left">
      <div><label htmlFor="wl-email" className="block text-sm font-medium">Email</label><input id="wl-email" type="email" required maxLength={254} autoComplete="email" className="input mt-2" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div><label htmlFor="wl-role" className="block text-sm font-medium">I am a</label>
        <select id="wl-role" className="input mt-2" value={role} onChange={(e) => setRole(e.target.value)}><option value="teacher">Teacher or instructor</option><option value="ta">Teaching assistant</option><option value="tutor">Tutor</option><option value="trainer">Trainer or coach</option><option value="admin">School or department leader</option><option value="other">Something else</option></select></div>
      <div><label htmlFor="wl-note" className="block text-sm font-medium">What would make this worth paying for? <span className="text-smoke">(optional)</span></label><textarea id="wl-note" maxLength={500} rows={2} className="input !py-2" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      {state === "error" && <p role="alert" className="text-sm text-sky-deep">We couldn&apos;t save that just now. Please try again in a bit.</p>}
      <button className="btn btn-primary w-full" disabled={state === "sending"}>{state === "sending" ? "Saving…" : "Join the waitlist"}</button>
    </form>
  );
}
