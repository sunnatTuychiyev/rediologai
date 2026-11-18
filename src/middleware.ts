import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Edge runtime: lib/auth (prisma) ni import qilmaymiz.
const HOME: Record<string, string> = { STUDENT: "/student", TEACHER: "/teacher", DOCTOR: "/doctor" };
const AREAS: [string, string][] = [
  ["/student", "STUDENT"],
  ["/teacher", "TEACHER"],
  ["/doctor", "DOCTOR"],
];

export default withAuth(
  function middleware(req) {
    const role = req.nextauth.token?.role;
    const path = req.nextUrl.pathname;
    for (const [prefix, required] of AREAS) {
      if (path.startsWith(prefix) && role !== required) {
        return NextResponse.redirect(new URL((role && HOME[role]) || "/login", req.url));
      }
    }
    return NextResponse.next();
  },
  { pages: { signIn: "/login" } },
);

export const config = { matcher: ["/student/:path*", "/teacher/:path*", "/doctor/:path*"] };
