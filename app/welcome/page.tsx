import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";
import { WaitlistForm } from "@/components/WaitlistForm";

export const metadata: Metadata = { title: "Pacer for teachers", description: "See who is lost while you teach, without anyone raising a hand. Recaps and practice written for you after class." };

const FEATURES = [
  ["See who's lost, live", "Students tap \"still confused\" privately. You see which step, never which student, and one click sends everyone back to it."],
  ["Quick check-ins, graded for you", "Ask a question with a hidden answer key. Watch a live correct/incorrect poll fill in, then reveal the answer to the class."],
  ["One-click post-class package", "A recap, three practice questions and a catch-up note for students who missed class, ready to paste into email or your LMS."],
  ["A board students can look back at", "Every cleared board is archived, so nobody loses a step they were still copying."],
] as const;

const PLANS = [
  { name: "Free", price: "$0", note: "For trying it in class", items: ["Live rooms and QR join", "Anonymous confusion signals", "Check-in poll", "A few AI answers per day"] },
  { name: "Teacher", price: "$9/mo", note: "or $79 a year", items: ["Everything in Free", "Unlimited AI help and recaps", "Saved lectures and exports", "Class rosters"], featured: true },
  { name: "School", price: "Talk to us", note: "per teacher, per year", items: ["Everything in Teacher", "Admin overview and sign-in with school accounts", "Privacy agreement and support", "Priority onboarding"] },
] as const;

export default function Page() {
  return (
    <main className="min-h-screen bg-eggshell">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6"><Link href="/" aria-label="Pacer home"><Logo /></Link><Link className="btn btn-outline btn-sm" href="/">Open Pacer</Link></header>
      <section className="mx-auto max-w-3xl px-6 pb-10 pt-12 text-center">
        <h1 className="display text-[40px] md:text-[56px]">Teach to the room you can&apos;t see.</h1>
        <p className="mt-4 text-lg text-smoke">In a big class nobody raises a hand. Pacer shows you, live and anonymously, where the class is lost, and writes the recap for you afterwards.</p>
        <a className="btn btn-primary mt-8" href="#waitlist">Join the waitlist</a>
      </section>
      <section aria-label="What it does" className="mx-auto grid max-w-5xl gap-4 px-6 sm:grid-cols-2">
        {FEATURES.map(([h, p]) => <div key={h} className="rounded-[24px] border border-stone bg-eggshell p-6"><h2 className="text-lg font-medium">{h}</h2><p className="mt-2 text-smoke">{p}</p></div>)}
      </section>
      <section aria-label="Pricing" className="mx-auto mt-16 max-w-5xl px-6">
        <h2 className="display text-center text-3xl">Simple pricing</h2>
        <p className="mt-2 text-center text-smoke">Pacer is free to try. Paid plans are not live yet; the waitlist gets first access and early-user pricing.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <div key={p.name} className={`rounded-[24px] border p-6 ${"featured" in p && p.featured ? "border-sky bg-sky-soft" : "border-stone bg-eggshell"}`}>
              <h3 className="text-lg font-medium">{p.name}</h3><p className="mt-2 text-3xl font-light">{p.price}</p><p className="text-sm text-smoke">{p.note}</p>
              <ul className="mt-4 space-y-2 text-sm">{p.items.map((i) => <li key={i}>{i}</li>)}</ul>
            </div>))}
        </div>
      </section>
      <section id="waitlist" aria-label="Join the waitlist" className="mx-auto mt-16 max-w-md px-6 pb-12">
        <h2 className="display text-center text-3xl">Get early access</h2>
        <div className="mt-6 rounded-[24px] border border-stone bg-eggshell p-6"><WaitlistForm /></div>
        <p className="mt-3 text-center text-xs text-smoke">We only use your email to tell you about Pacer. See our <Link className="underline" href="/privacy">privacy page</Link>.</p>
      </section>
      <SiteFooter />
    </main>
  );
}
