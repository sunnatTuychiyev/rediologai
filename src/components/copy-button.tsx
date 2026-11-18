"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          toast.success("Nusxa olindi");
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Nusxa olib bo'lmadi");
        }
      }}
    >
      {done ? <Check /> : <Copy />} Nusxa olish
    </Button>
  );
}
