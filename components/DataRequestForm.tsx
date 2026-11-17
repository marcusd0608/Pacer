"use client";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase";

export function DataRequestForm() {
  const [email, setEmail] = useState(""); const [kind, setKind] = useState("delete"); const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setState("sending");
    const sb = getSupabase();
    if (!sb) { setState("error"); return; }
    const { error } = await sb.from("data_requests").insert({ email: email.trim(), kind, details: details.trim() || null });
    setState(error ? "error" : "done");
  };
  if (state === "done") return <p role="status" className="mt-6 rounded-2xl bg-sky-soft p-4">Thanks. We received your request and will follow up at that email address.</p>;
  return (
    <form onSubmit={submit} className="mt-6 space-y-4 rounded-[24px] border border-stone bg-eggshell p-6">
      <div><label htmlFor="dr-email" className="block text-sm font-medium">Your email</label><input id="dr-email" type="email" required maxLength={254} autoComplete="email" className="input mt-2" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div><label htmlFor="dr-kind" className="block text-sm font-medium">What do you need?</label>
        <select id="dr-kind" className="input mt-2" value={kind} onChange={(e) => setKind(e.target.value)}><option value="delete">Delete my data</option><option value="export">Send me a copy of my data</option><option value="question">I have a privacy question</option></select></div>
      <div><label htmlFor="dr-details" className="block text-sm font-medium">Anything we should know <span className="text-smoke">(optional)</span></label><textarea id="dr-details" maxLength={1000} rows={3} className="input !py-2" value={details} onChange={(e) => setDetails(e.target.value)} /></div>
      {state === "error" && <p role="alert" className="text-sm text-sky-deep">We couldn&apos;t send that right now. Please try again later or contact us by email.</p>}
      <button className="btn btn-primary" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send request"}</button>
    </form>
  );
}
