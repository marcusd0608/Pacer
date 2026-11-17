"use client";
import { SiteFooter } from "@/components/SiteFooter";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Logo } from "@/components/Logo";
import { AuthBar } from "@/components/AuthBar";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { recordLecture } from "@/lib/cloudProfile";
import { useAuth } from "@/lib/useAuth";
import { createMeeting } from "@/lib/useRoom";
import { LearnedBox, ProgressBox, SignIn } from "@/components/Dashboard";
import { authEnabled } from "@/lib/supabase";
import { TeachingDashboard } from "@/components/TeachingDashboard";
import { continueLecture, type SavedLecture } from "@/lib/savedLectures";

export default function Home() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [guest, setGuest] = useState(false);
  useEffect(() => { try { setGuest(localStorage.getItem("pacer:guest") === "1"); } catch { /* ignore */ } }, []);
  const [code, setCode] = useState("");
  const [nick, setNick] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [err, setErr] = useState("");
  const [lobby, setLobby] = useState<string | null>(null);
  const [teaching, setTeaching] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [hostError, setHostError] = useState("");
  useEffect(() => {
    const readView = () => setTeaching(new URLSearchParams(window.location.search).get("view") === "teaching");
    readView();
    window.addEventListener("popstate", readView);
    return () => window.removeEventListener("popstate", readView);
  }, []);
  const switchView = (next: boolean) => {
    if (teaching === next) return;
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("view", "teaching");
    else url.searchParams.delete("view");
    window.history.pushState(null, "", url);
    setTeaching(next);
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) { setErr("Enter the 6-digit code your teacher shared."); return; }
    try { localStorage.setItem("pacer:nick", nick); } catch { /* ignore */ }
    router.push(`/room/${code}`);
  };
  const link = lobby && typeof window !== "undefined" ? `${window.location.origin}/room/${lobby}` : "";
  const host = async (lecture?: SavedLecture) => {
    if (continuing) return;
    setHostError("");
    setContinuing(true);
    try {
      const materials = lecture ? await continueLecture(lecture, user?.id) : undefined;
      const meetingTitle = (lecture?.title ?? title.trim()) || "Untitled lecture";
      const meetingSubject = lecture ? lecture.subject : subject.trim() || undefined;
      const meeting = createMeeting(meetingTitle, meetingSubject, materials);
      setLobby(meeting);
      if (user) void recordLecture(user.id, { code: meeting, title: meetingTitle, subject: meetingSubject });
    } catch {
      setHostError(lecture ? "Could not restore this lecture. Check that its slides are available and try again." : "Could not start the meeting. Check your browser storage and try again.");
    } finally {
      setContinuing(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="glow pointer-events-none absolute left-1/2 top-[42%] h-[720px] w-[720px] rounded-full bg-sky opacity-30 blur-3xl" style={{ transform: "translate(-50%,-50%)" }} />
      <header className="relative mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6"><Logo /><AuthBar /></header>
      {!ready ? <p role="status" className="relative px-6 py-8 text-center text-smoke">Opening Pacer…</p> :
        authEnabled() && !user && !guest ? <div className="relative px-6"><SignIn onGuest={() => { try { localStorage.setItem("pacer:guest", "1"); } catch { /* ignore */ } setGuest(true); }} /></div> : (
      <>
      <nav aria-label="Homepage view" className="relative mx-auto flex w-fit gap-1 rounded-xl border border-stone bg-eggshell p-1">
        <button type="button" className={`btn btn-sm btn-outline ${!teaching ? "chip-on" : ""}`} aria-pressed={!teaching} onClick={() => switchView(false)}>Learning</button>
        <button type="button" className={`btn btn-sm btn-outline ${teaching ? "chip-on" : ""}`} aria-pressed={teaching} onClick={() => switchView(true)}>Teaching</button>
      </nav>
      <div className={`relative mx-auto grid max-w-[1280px] items-start gap-6 px-6 pb-8 pt-6 ${teaching ? "max-w-xl" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)_minmax(0,1fr)]"}`}>
      <section className={`relative flex flex-col items-center text-center ${teaching ? "" : "lg:col-start-2 lg:row-start-1"}`}>
        <h1 className="display text-[34px] md:text-[44px]">{teaching ? "Teaching dashboard" : <>{user ? `Hi, ${user.name.split(" ")[0]}.` : "The classroom,"}<br />{user ? "Ready to learn?" : "in sync."}</>}</h1>
        {!teaching && <p className="mt-3 text-base text-graphite">One lesson, with every student moving through it their own way.</p>}

        {!teaching || !lobby ? (
          <div className="mt-5 w-full space-y-4 text-left md:mt-8">
            {!teaching ? <form onSubmit={join} className="card rounded-[24px] border border-stone bg-eggshell/90 p-6 shadow-[var(--shadow-whisper)]">
              <label htmlFor="code" className="block text-sm font-medium">Meeting code</label>
              <input id="code" inputMode="numeric" autoComplete="off" className="input mt-2 text-center text-2xl tracking-[0.4em]" placeholder="000000" value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setErr(""); }} aria-invalid={!!err} aria-describedby={err ? "code-err" : undefined} />
              <label htmlFor="nick" className="mt-4 block text-sm font-medium">Nickname <span className="text-smoke">(optional)</span></label>
              <input id="nick" className="input mt-2" value={nick} onChange={(e) => setNick(e.target.value)} />
              {err && <p id="code-err" role="alert" className="mt-2 text-sm text-sky-deep">{err}</p>}
              <button className="btn btn-primary mt-4 w-full text-base" type="submit">Join Meeting</button>
            </form> : (
            <form onSubmit={(e) => { e.preventDefault(); void host(); }} className="card rounded-[24px] border border-stone bg-eggshell/90 p-6 shadow-[var(--shadow-whisper)]">
              <label htmlFor="title" className="block text-sm font-medium">Lecture title</label>
              <input id="title" className="input mt-2" placeholder="Solving Linear Equations" value={title} onChange={(e) => setTitle(e.target.value)} />
              <label htmlFor="subject" className="mt-4 block text-sm font-medium">Subject <span className="text-smoke">(optional)</span></label>
              <input id="subject" className="input mt-2" placeholder="Algebra" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <button className="btn btn-dark mt-4 w-full text-base" type="submit" disabled={continuing}>Start Meeting</button>
            </form>
            )}
          </div>
        ) : (
          <div className="mt-10 w-full rounded-[24px] border border-stone bg-eggshell/90 p-6 text-center shadow-[var(--shadow-whisper)]">
            <p className="text-sm text-smoke">Share this code with your class</p>
            <p className="my-2 text-5xl font-light tracking-[0.2em]" aria-label={`Meeting code ${lobby.split("").join(" ")}`}>{lobby}</p>
            <div className="mx-auto my-4 w-fit rounded-2xl border border-stone bg-white p-3"><QRCodeSVG value={link} size={160} /></div>
            <input aria-label="Meeting link" className="input text-sm" readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
            <div className="mt-5 flex flex-col items-start gap-3 sm:flex-row [&>*]:w-full sm:[&>*]:w-auto">
              <CopyLinkButton key={link} link={link} className="flex-1" />
              <button className="btn btn-primary flex-1" onClick={() => router.push(`/room/${lobby}?role=teacher`)}>Enter classroom</button>
            </div>
          </div>
        )}
      </section>
      {!teaching && <><div className="min-w-0 lg:col-start-1 lg:row-start-1"><LearnedBox /></div>
        <div className="min-w-0 lg:col-start-3 lg:row-start-1"><ProgressBox /></div></>}
      </div>
      {teaching && !lobby && <TeachingDashboard key={user?.id ?? "guest"} userId={user?.id} continuing={continuing} error={hostError} onContinue={(lecture) => void host(lecture)} />}
      </>
      )}
      <SiteFooter />
    </main>
  );
}
