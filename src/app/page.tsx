import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  redirect(homeFor(session.user.role));
}
