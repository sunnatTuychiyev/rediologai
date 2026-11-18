"use client";
import { useState } from "react";

type Change = { path: string; from: unknown; to: unknown };
const fmt = (v: unknown) => (v == null || v === "" ? "∅" : typeof v === "string" ? v : JSON.stringify(v));

export function AuditDetails({ json }: { json: string }) {
  const [open, setOpen] = useState(false);
  let d: Record<string, unknown> = {};
  try {
    d = JSON.parse(json);
  } catch {
    /* noop */
  }
  const changes = (d.changes as Change[] | undefined) ?? [];
  const short = Object.entries(d)
    .filter(([k, v]) => k !== "snapshot" && v != null && typeof v !== "object")
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
    .join(" · ");
  return (
    <div className="text-[12.5px]">
      <p className="text-muted-foreground">{short || "—"}{changes.length ? ` · ${changes.length} ta o'zgarish` : ""}</p>
      {changes.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {changes.slice(0, open ? 50 : 3).map((c, i) => (
            <li key={i} className="break-words">
              <code className="text-[11px] text-muted-foreground">{c.path}</code>: <span className="text-red-700 line-through decoration-red-300">{fmt(c.from).slice(0, 80)}</span> → <span className="font-semibold text-emerald-800">{fmt(c.to).slice(0, 80)}</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="mt-1 text-[12px] font-semibold text-cyan-ink hover:underline" onClick={() => setOpen((o) => !o)}>
        {open ? "Yopish" : "JSON tafsilot"}
      </button>
      {open && <pre className="mt-1 max-h-72 overflow-auto rounded-[10px] bg-surface2 p-2 text-[11px] leading-snug">{JSON.stringify(d, null, 2)}</pre>}
    </div>
  );
}
