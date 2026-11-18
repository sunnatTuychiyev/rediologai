import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: { id: string; name: string; email: string; role: "STUDENT" | "TEACHER" | "DOCTOR" };
  }
  interface User {
    id: string;
    role: "STUDENT" | "TEACHER" | "DOCTOR";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "STUDENT" | "TEACHER" | "DOCTOR";
  }
}
