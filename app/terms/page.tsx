import type { Metadata } from "next";
import { contactLine, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms | Pacer" };

export default function Page() {
  return (
    <LegalPage title="Terms of use" updated="November 2026">
      <p>By using Pacer you agree to these terms. If you use Pacer for a school or district, your school&apos;s agreement with us comes first.</p>

      <h2>Using Pacer</h2>
      <ul>
        <li>Teachers are responsible for what they put on the board and for using Pacer in line with their school&apos;s rules, including any rules about student data.</li>
        <li>Don&apos;t use Pacer to harass anyone, share unlawful content, or collect information about students without permission.</li>
        <li>Don&apos;t try to break, overload or probe the service, or use the AI features outside the app. We limit how fast the AI can be used.</li>
      </ul>

      <h2>AI help</h2>
      <p>Pacer&apos;s AI can be wrong. Answers are labeled as AI-written and are meant to support, not replace, the teacher. Teachers should review anything they share with students, including generated recaps and practice questions. Pacer does not diagnose or label students.</p>

      <h2>Your content</h2>
      <p>You keep ownership of what you create. You give Pacer permission to store and display it as needed to run the service for you and your class.</p>

      <h2>Availability and changes</h2>
      <p>Pacer is an early product provided as is, without promises of uninterrupted service. We may change or end features, and we will try to give notice of changes that affect saved work.</p>

      <h2>Liability</h2>
      <p>To the extent the law allows, Pacer is not liable for indirect or lost-profit damages from using the service. Nothing here limits rights that cannot be limited by law.</p>

      <h2>Contact</h2>
      <p>Questions about these terms: {contactLine}.</p>
    </LegalPage>
  );
}
