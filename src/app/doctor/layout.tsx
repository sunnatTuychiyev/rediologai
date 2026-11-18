import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("DOCTOR");
  return <AppShell role="DOCTOR" userName={user.name}>{children}</AppShell>;
}
