"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  BarChart3, BookOpen, ClipboardList, FileBadge2, FilePlus2, FolderPlus, History, LayoutDashboard, ListChecks, LogOut, Menu, ScrollText, Users, UsersRound, X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";

const NAV = {
  STUDENT: [
    { href: "/student", label: "Bosh sahifa", icon: LayoutDashboard },
    { href: "/student/cases", label: "Mashqlar", icon: BookOpen },
    { href: "/student/history", label: "Tarix", icon: History },
  ],
  TEACHER: [
    { href: "/teacher", label: "Bosh sahifa", icon: LayoutDashboard },
    { href: "/teacher/cases", label: "Mashqlar", icon: BookOpen },
    { href: "/teacher/cases/new", label: "Yangi mashq qo'shish", icon: FolderPlus },
    { href: "/teacher/students", label: "O'quvchilar", icon: Users },
    { href: "/teacher/analytics", label: "Statistika", icon: BarChart3 },
    { href: "/teacher/groups", label: "Guruhlar", icon: UsersRound },
    { href: "/teacher/assignments", label: "Topshiriqlar", icon: ClipboardList },
  ],
  DOCTOR: [
    { href: "/doctor", label: "Bosh sahifa", icon: LayoutDashboard },
    { href: "/doctor/studies", label: "Tekshiruvlar", icon: ListChecks },
    { href: "/doctor/studies/new", label: "Yangi tekshiruv", icon: FilePlus2 },
    { href: "/doctor/audit", label: "Audit jurnali", icon: ScrollText },
    { href: "/doctor/model-card", label: "Model kartasi", icon: FileBadge2 },
  ],
} as const;

const ROOT = { STUDENT: "/student", TEACHER: "/teacher", DOCTOR: "/doctor" } as const;
const ROLE_LABEL = { STUDENT: "Talaba", TEACHER: "O'qituvchi", DOCTOR: "Rentgenolog" } as const;

export function AppShell({ role, userName, children }: { role: keyof typeof NAV; userName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items: readonly { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = NAV[role];
  const root = ROOT[role];
  const isActive = (href: string) =>
    href === root ? pathname === href : pathname === href || (pathname.startsWith(href + "/") && !items.some((i) => i.href !== href && pathname.startsWith(i.href) && i.href.length > href.length));

  const nav = (
    <nav className="flex flex-col gap-1">
      {items.map((it) => {
        const active = isActive(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] transition-colors",
              active ? "bg-cyan font-semibold text-navy" : "font-medium text-nav-text hover:bg-white/[.07] hover:text-white",
            )}
          >
            <it.icon className="h-[18px] w-[18px] shrink-0" />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );

  const roleLabel = ROLE_LABEL[role];
  const user = (
    <div className="flex items-center gap-2.5 border-t border-white/10 px-2.5 pb-1 pt-3.5 text-[13px] text-muted-dark">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cyan font-display text-[15px] font-bold text-navy" aria-hidden>
        {userName.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0">
        <b className="block truncate font-semibold text-white">{userName}</b>
        <button type="button" className="inline-flex items-center gap-1 text-[12.5px] text-muted-dark hover:text-white" onClick={() => signOut({ callbackUrl: "/login" })}>
          <LogOut className="h-3.5 w-3.5" /> Chiqish
        </button>
      </span>
    </div>
  );

  const sidebar = (
    <>
      <Link href={root} className="mb-2 inline-flex min-h-11 items-center px-2 pb-3 pt-1" aria-label="RadiologAI — bosh sahifa" onClick={() => setOpen(false)}>
        <Logo dark />
      </Link>
      <span className="px-3 pb-1.5 pt-2.5 text-[11.5px] font-semibold uppercase tracking-[.12em] text-muted-dark">{roleLabel}</span>
      {nav}
      <div className="mt-auto pt-4">{user}</div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="hidden w-[248px] shrink-0 flex-col gap-1 overflow-y-auto bg-navy px-3.5 py-[22px] text-white lg:flex">
        {sidebar}
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-[264px] flex-col gap-1 overflow-y-auto bg-navy px-3.5 py-[22px] text-white shadow-md">
            <button className="absolute right-3 top-5 grid h-10 w-10 place-items-center rounded-[10px] text-muted-dark hover:bg-white/[.07] hover:text-white" onClick={() => setOpen(false)} aria-label="Yopish">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between bg-navy px-4 text-white lg:hidden">
          <button className="grid h-10 w-10 place-items-center rounded-[10px] hover:bg-white/[.07]" onClick={() => setOpen(true)} aria-label="Menyu"><Menu className="h-5 w-5" /></button>
          <Link href={root} aria-label="RadiologAI — bosh sahifa"><Logo dark className="text-lg" /></Link>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-cyan font-display text-[15px] font-bold text-navy" aria-hidden>
            {userName.slice(0, 1).toUpperCase()}
          </span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[32px]">{title}</h1>
        {description && <p className="mt-1.5 text-[15px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon?: React.ComponentType<{ className?: string }>; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-card px-5 py-10 text-center">
      {Icon && <Icon className="mb-3 h-10 w-10 text-muted-foreground/60" />}
      <p className="font-display font-bold text-navy">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
