import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("STUDENT");
  return <AppShell role="STUDENT" userName={user.name}>{children}</AppShell>;
}
