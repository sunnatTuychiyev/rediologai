"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, UserMinus, UserPlus, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/app-shell";
import { addStudentToGroup, createGroup, removeStudentFromGroup } from "./actions";

type Group = { id: string; name: string; code: string; members: { id: string; name: string; email: string }[] };

export function GroupsClient({ groups }: { groups: Group[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { toast.success(msg); after?.(); router.refresh(); } else toast.error(r.error);
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex gap-2 p-4">
          <Input placeholder="Yangi guruh nomi, masalan: Radiologiya 4-kurs, 2-guruh" value={name} onChange={(e) => setName(e.target.value)} />
          <Button disabled={pending} onClick={() => run(() => createGroup(name), "Guruh yaratildi", () => setName(""))}><Plus /> Yaratish</Button>
        </CardContent>
      </Card>
      {groups.length === 0 && <EmptyState icon={UsersRound} title="Guruh yo'q" text="Birinchi guruhingizni yarating." />}
      {groups.map((g) => (
        <Card key={g.id}>
          <CardHeader>
            <CardTitle>{g.name}</CardTitle>
            <CardDescription>Guruh kodi: <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{g.code}</span> · {g.members.length} talaba</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="talaba@email.uz" value={emails[g.id] ?? ""} onChange={(e) => setEmails({ ...emails, [g.id]: e.target.value })} />
              <Button variant="outline" disabled={pending} onClick={() => run(() => addStudentToGroup(g.id, emails[g.id] ?? ""), "Talaba qo'shildi", () => setEmails({ ...emails, [g.id]: "" }))}>
                <UserPlus /> Qo&apos;shish
              </Button>
            </div>
            <div className="divide-y rounded-md border">
              {g.members.length === 0 && <p className="p-3 text-sm text-muted-foreground">Hali talaba yo&apos;q.</p>}
              {g.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-2.5 text-sm">
                  <div><span className="font-medium">{m.name}</span> <span className="text-muted-foreground">· {m.email}</span></div>
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => removeStudentFromGroup(m.id), "Guruhdan chiqarildi")}><UserMinus /></Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
