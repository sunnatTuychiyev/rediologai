"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth-layout";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", groupCode: "" });
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoading(false);
      toast.error(data.error ?? "Xatolik yuz berdi");
      return;
    }
    await signIn("credentials", { email: form.email, password: form.password, redirect: false });
    toast.success("Ro'yxatdan o'tdingiz!");
    router.replace("/student");
    router.refresh();
  }

  return (
    <AuthLayout title="Ro'yxatdan o'tish" subtitle="Talabalar uchun. O'qituvchingizdan guruh kodini oling.">
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Ism familiya</Label>
          <Input id="name" required value={form.name} onChange={set("name")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={form.email} onChange={set("email")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Parol</Label>
          <Input id="password" type="password" required minLength={6} value={form.password} onChange={set("password")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="groupCode">Guruh kodi (ixtiyoriy)</Label>
          <Input id="groupCode" placeholder="masalan: RAD4-1" value={form.groupCode} onChange={set("groupCode")} />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />} Ro&apos;yxatdan o&apos;tish
        </Button>
        <p className="text-center text-[13.5px] text-muted-foreground">
          Hisobingiz bormi?{" "}
          <Link href="/login" className="font-semibold text-cyan-ink underline-offset-[3px] hover:text-navy hover:underline">
            Kirish
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
