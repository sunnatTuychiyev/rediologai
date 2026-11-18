import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app-shell";
import { GroupsClient } from "./groups-client";

export default async function GroupsPage() {
  const user = await requireUser("TEACHER");
  const groups = await prisma.group.findMany({
    where: { teacherId: user.id },
    include: { members: { select: { id: true, name: true, email: true }, orderBy: { name: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader title="Guruhlar" description="Talabalar guruh kodi orqali ro'yxatdan o'tishi yoki siz email orqali qo'shishingiz mumkin" />
      <GroupsClient groups={groups} />
    </div>
  );
}
