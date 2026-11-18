"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";

export function PendingResult({ id, status, canRetry }: { id: string; status: string; canRetry: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function retry() {
    setLoading(true);
    const res = await fetch(`/api/submissions/${id}/retry`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (body.status === "DONE") router.refresh();
    else toast.error("AI hali ham javob bermadi. Birozdan so'ng urinib ko'ring.");
  }
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm rounded-xl border border-line-soft bg-card p-8 text-center shadow-sm">
        {status === "PENDING" ? (
          <>
            <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
            <p className="font-medium">AI xulosangizni tekshirmoqda…</p>
            <Button variant="outline" className="mt-4" onClick={() => router.refresh()}>Yangilash</Button>
          </>
        ) : (
          <>
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-500" />
            <p className="font-medium">Tekshiruvda xatolik yuz berdi</p>
            <p className="mt-1 text-sm text-muted-foreground">Xulosangiz saqlangan.</p>
            {canRetry && (
              <Button className="mt-4" onClick={retry} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Qayta urinish
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
