import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="relative mx-auto max-w-[1280px] px-6 pb-10 pt-6 text-sm text-smoke">
      <nav aria-label="Legal and company" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-stone pt-6">
        <Link className="underline-offset-2 hover:underline" href="/welcome">For teachers</Link>
        <Link className="underline-offset-2 hover:underline" href="/privacy">Privacy</Link>
        <Link className="underline-offset-2 hover:underline" href="/terms">Terms</Link>
        <Link className="underline-offset-2 hover:underline" href="/data-deletion">Delete my data</Link>
      </nav>
    </footer>
  );
}
