import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "./prisma";
import type { Role } from "./types";

const credentialsSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
        if (!user) return null;
        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, name: user.name, email: user.email, role: user.role as Role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = { id: token.id, name: token.name ?? "", email: token.email ?? "", role: token.role };
      return session;
    },
  },
};

export function homeFor(role: Role | string | undefined) {
  return role === "TEACHER" ? "/teacher" : role === "DOCTOR" ? "/doctor" : role === "STUDENT" ? "/student" : "/login";
}

export async function getSession() {
  return getServerSession(authOptions);
}

/** For server components/actions: returns the user or redirects. */
export async function requireUser(role?: Role) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (role && session.user.role !== role) redirect(homeFor(session.user.role));
  return session.user;
}

/** For route handlers: returns the user or null (caller responds 401/403). */
export async function apiUser(role?: Role) {
  const session = await getSession();
  if (!session?.user) return null;
  if (role && session.user.role !== role) return null;
  return session.user;
}
