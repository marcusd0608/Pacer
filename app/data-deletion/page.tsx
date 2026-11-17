import type { Metadata } from "next";
import { DataRequestForm } from "@/components/DataRequestForm";
import { contactLine, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Delete my data | Pacer" };

export default function Page() {
  return (
    <LegalPage title="Delete or export my data" updated="November 2026">
      <p>Use this form to ask us to delete the data tied to your Pacer account, or to send you a copy. We will confirm by email and tell you when it is done. You can also {contactLine}.</p>
      <p>Guests: notes and progress you saved without signing in live only in your own browser. You can remove them yourself by clearing site data for this website.</p>
      <DataRequestForm />
    </LegalPage>
  );
}
