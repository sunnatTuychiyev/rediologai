"use client";
import { useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * "Chop etish": serverda PDF yaratadi, faylni yuklab beradi va printer oynasini ochadi
 * (PDF yashirin iframe ichida — brauzer printer dialogini chiqaradi).
 */
export function PrintPdfButton({ studyId, code, approved, size = "sm", saveFirst }: { studyId: string; code: string; approved: boolean; size?: "sm" | "default"; saveFirst?: () => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);

  async function getPdf() {
    if (saveFirst && !(await saveFirst())) throw new Error("Saqlab bo'lmadi");
    const res = await fetch(`/api/doctor/studies/${studyId}/pdf`, { cache: "no-store" });
    if (!res.ok) throw new Error("PDF yaratilmadi");
    return URL.createObjectURL(await res.blob());
  }

  function download(url: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${code}${approved ? "" : "-qoralama"}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function print() {
    setBusy(true);
    try {
      const url = await getPdf();
      download(url);
      const frame = document.createElement("iframe");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      frame.src = url;
      frame.onload = () => {
        setTimeout(() => {
          try {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
          } catch {
            window.open(url, "_blank"); // ba'zi brauzerlar iframe dagi PDF ni chop etishga ruxsat bermaydi
          }
        }, 300);
        setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(url);
        }, 120_000);
      };
      document.body.appendChild(frame);
      toast.success("PDF yuklab olindi — printer oynasi ochilmoqda");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  async function onlyDownload() {
    setBusy(true);
    try {
      const url = await getPdf();
      download(url);
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-1.5">
      <Button size={size} onClick={print} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Printer />} Chop etish
      </Button>
      <Button size={size} variant="outline" onClick={onlyDownload} disabled={busy} title="Faqat PDF yuklab olish">
        <Download /> PDF
      </Button>
    </div>
  );
}
