import type { Metadata } from "next";
import { contactLine, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy | Pacer" };

export default function Page() {
  return (
    <LegalPage title="Privacy" updated="November 2026">
      <p>Pacer is a live classroom whiteboard with optional AI help for students. This page says what we collect, who handles it, and how you can ask us to delete it. Plain language, on purpose.</p>

      <h2>What Pacer handles</h2>
      <ul>
        <li><b>Lecture content.</b> Notes, equations, drawings and slides a teacher puts on the board, plus topic titles. Live rooms are held by the teacher&apos;s browser and shared with the students who join with the meeting code.</li>
        <li><b>Student activity in a room.</b> Anonymous signals such as &quot;still confused&quot; or &quot;that helped&quot;, check-in answers, and an optional nickname. Teachers see totals, not who asked what, and groups under three are hidden unless the teacher turns on small-class mode.</li>
        <li><b>Questions sent to the AI.</b> When a student asks the AI helper a question or snips part of the board, the question and the selected lecture content are sent to our AI provider to produce an answer.</li>
        <li><b>Accounts (only if you sign in).</b> Your name and email from Google, saved lessons, a private learning profile and, for teachers, saved lectures. Guests can use Pacer without an account; their notes and progress stay on their own device.</li>
        <li><b>Anonymous usage counts.</b> We count events such as &quot;a lecture started&quot; or &quot;a question was asked&quot;, with a scrambled room identifier. These counts never include names, notes, questions or answers.</li>
      </ul>

      <h2>Who else handles it</h2>
      <ul>
        <li><b>Vercel</b> hosts the website.</li>
        <li><b>Supabase</b> provides the database, sign-in and live sync.</li>
        <li><b>Anthropic</b> processes AI requests. We use their commercial API, and under their commercial terms API content is not used to train their models. We will confirm this in writing before any school agreement.</li>
        <li><b>Google</b> provides sign-in, if you choose it.</li>
      </ul>
      <p>We do not sell personal information and we do not show ads.</p>

      <h2>Students and children</h2>
      <p>Pacer is meant to be used by students under the direction of their teacher or school. We do not knowingly collect personal information from children under 13 without the authorization of a school or parent. Students never need an account. If you believe a child has given us personal information without proper authorization, {contactLine} and we will remove it.</p>

      <h2>How long we keep it</h2>
      <p>Live room data lives in the teacher&apos;s browser and is gone when it is cleared. Saved lessons and lectures stay in an account until you delete them or ask us to. Anonymous usage counts are kept in aggregate. Server logs are kept for a short period for security and debugging.</p>

      <h2>Your choices</h2>
      <p>You can ask to see or delete the data tied to your account on the <a className="underline" href="/data-deletion">data request page</a>, or {contactLine}. Teachers can delete a saved lecture from their dashboard.</p>

      <h2>Security, honestly</h2>
      <p>Traffic is encrypted in transit. Pacer is an early product: live rooms are protected by the meeting code, so anyone who has the code can join, and we are adding stronger teacher accounts and private channels. Do not put sensitive personal information on the board.</p>

      <h2>Changes</h2>
      <p>We will update this page when things change and show the date above.</p>
    </LegalPage>
  );
}
