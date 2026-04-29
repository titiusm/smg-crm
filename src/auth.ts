// NextAuth v5 configuration — credentials provider + Prisma adapter.
// Role and userId are attached to the session so RBAC can be enforced server-side.
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: Role;
      permissions: Record<string, unknown>;
      twilioPhoneNumber: string | null;
    };
  }
}

interface AppJwtExtras {
  id?: string;
  role?: Role;
  firstName?: string;
  lastName?: string;
  permissions?: Record<string, unknown>;
  twilioPhoneNumber?: string | null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });
        if (!user || !user.isActive || !user.hashedPassword) return null;

        const ok = await bcrypt.compare(password, user.hashedPassword);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          permissions: user.permissions as Record<string, unknown>,
          twilioPhoneNumber: user.twilioPhoneNumber,
        } as unknown as {
          id: string;
          email: string;
          name: string;
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as {
          id: string;
          role: Role;
          firstName: string;
          lastName: string;
          permissions: Record<string, unknown>;
          twilioPhoneNumber: string | null;
        };
        const t = token as typeof token & AppJwtExtras;
        t.id = u.id;
        t.role = u.role;
        t.firstName = u.firstName;
        t.lastName = u.lastName;
        t.permissions = u.permissions;
        t.twilioPhoneNumber = u.twilioPhoneNumber;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as AppJwtExtras;
      if (session.user) {
        session.user.id = t.id ?? "";
        session.user.role = (t.role ?? "SALES_REP") as Role;
        session.user.firstName = t.firstName ?? "";
        session.user.lastName = t.lastName ?? "";
        session.user.permissions = t.permissions ?? {};
        session.user.twilioPhoneNumber = t.twilioPhoneNumber ?? null;
      }
      return session;
    },
  },
});

/** Require an authenticated session; throws if absent. */
export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("UNAUTHENTICATED");
  }
  return session;
}

/** Require a session whose role is in the allowlist. */
export async function requireRole(allowed: Role[]) {
  const session = await requireSession();
  if (!allowed.includes(session.user.role)) {
    throw new Error("FORBIDDEN");
  }
  return session;
}
