import Link from "next/link";
import { Logo } from "./Logo";
import { SiteFooter } from "./SiteFooter";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-eggshell">
      <header className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6"><Link href="/" aria-label="Pacer home"><Logo /></Link></header>
      <article className="mx-auto max-w-3xl px-6 pb-8 pt-4 leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
        <h1 className="display text-[40px]">{title}</h1>
        <p className="mt-2 text-sm text-smoke">Last updated {updated}. This is a working draft written for an early product and is not legal advice. It will be reviewed by counsel before Pacer is used under a school or district agreement.</p>
        {children}
      </article>
      <SiteFooter />
    </main>
  );
}

export const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
export const contactLine = CONTACT ? <>email <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> or use the form on the <Link className="underline" href="/data-deletion">data request page</Link></> : <>use the form on the <Link className="underline" href="/data-deletion">data request page</Link></>;
