import Link from "next/link";
import { Logo } from "./logo";

/** Kirish / ro'yxatdan o'tish sahifalari karkasi (radiologai-html/login.html dizayni). */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-wrap bg-card">
      <aside className="has-pattern flex flex-[1_1_420px] flex-col justify-between gap-8 bg-navy p-8 text-white sm:p-10">
        <Link href="/" aria-label="RadiologAI — bosh sahifa" className="self-start">
          <Logo dark />
        </Link>
        <div className="flex max-w-[440px] flex-col gap-4">
          <h1 className="font-display text-[34px] font-extrabold leading-[1.08] tracking-[-0.035em] sm:text-[42px]">
            Har bir surat — <span className="text-cyan">kichik dars.</span>
          </h1>
          <p className="text-[17px] text-nav-text">
            Rentgen, KT va MRT tasvirlarini o&apos;qing, xulosa yozing va AI&apos;dan darhol batafsil fikr-mulohaza oling.
          </p>
        </div>
        <span className="text-[13.5px] text-muted-dark">O&apos;quv vositasi · Klinik xulosa faqat shifokor tasdig&apos;idan keyin rasmiy</span>
      </aside>

      <main className="flex flex-[999_1_480px] items-center justify-center px-6 py-10">
        <div className="flex w-full max-w-[420px] flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <h2 className="font-display text-[30px] font-extrabold leading-tight tracking-[-0.02em]">{title}</h2>
            <p className="text-muted-foreground">{subtitle}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
