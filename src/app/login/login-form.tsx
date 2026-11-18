"use client";
import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BarChart3, GraduationCap, Loader2, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth-layout";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (!res || res.error) {
      toast.error("Email yoki parol noto'g'ri");
      return;
    }
    toast.success("Xush kelibsiz!");
    router.replace(params.get("callbackUrl") || "/");
    router.refresh();
  }

  function fill(e: string) {
    setEmail(e);
    setPassword("demo1234");
  }

  const demo = [
    { email: "teacher@demo.uz", title: "O'qituvchi", text: "Mashqlar, guruhlar va statistika", icon: BarChart3 },
    { email: "student1@demo.uz", title: "Talaba 1", text: "Mashq va natijalar", icon: GraduationCap },
    { email: "doctor@demo.uz", title: "Rentgenolog", text: "Mammografiya xulosa qoralamasi", icon: Stethoscope },
  ];

  return (
    <AuthLayout title="Xush kelibsiz" subtitle="Davom etish uchun tizimga kiring.">
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="ism.familiya@demo.uz" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Parol</Label>
          <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />} Kirish
        </Button>
        <p className="text-center text-[13.5px] text-muted-foreground">
          Hisobingiz yo&apos;qmi?{" "}
          <Link href="/register" className="font-semibold text-cyan-ink underline-offset-[3px] hover:text-navy hover:underline">
            Ro&apos;yxatdan o&apos;tish
          </Link>
        </p>
      </form>

      <div className="flex flex-col gap-2.5 border-t border-line-soft pt-5">
        <span className="text-[13px] font-medium text-muted-foreground">Demo: hisobni tanlang (parol: demo1234)</span>
        {demo.map((d) => (
          <button
            key={d.email}
            type="button"
            onClick={() => fill(d.email)}
            className="flex items-center gap-3.5 rounded-[14px] border border-line bg-card px-4 py-3.5 text-left text-navy transition-colors hover:border-cyan-ink hover:bg-cyan-100"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-100 text-[#075E6A]" aria-hidden>
              <d.icon className="h-5 w-5" />
            </span>
            <span>
              <b className="block font-semibold">{d.title}</b>
              <span className="text-[13.5px] text-muted-foreground">{d.text}</span>
            </span>
            <span className="ml-auto text-muted-foreground" aria-hidden>→</span>
          </button>
        ))}
      </div>
    </AuthLayout>
  );
}
