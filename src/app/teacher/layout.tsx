import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("TEACHER");
  return <AppShell role="TEACHER" userName={user.name}>{children}</AppShell>;
}
