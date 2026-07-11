import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

/** Extended session user carrying role and onboarding state from JWT. */
export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
  role: 'developer' | 'admin';
  onboarding_completed: boolean;
}

declare module 'next-auth' {
  interface Session {
    user: SessionUser;
  }
  interface User {
    role?: 'developer' | 'admin';
    onboarding_completed?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: 'developer' | 'admin';
    onboarding_completed?: boolean;
  }
}

/**
 * NextAuth configuration with JWT-based session strategy.
 * MVP: credentials provider with email/password against local store.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'dev@example.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // MVP: Simple validation. In production, verify against PostgreSQL developers table.
        // For now, accept any email with password length >= 8
        if (credentials.password.length < 8) {
          return null;
        }

        // TODO: query developers table for role + onboarding_completed
        return {
          id: credentials.email,
          email: credentials.email,
          name: credentials.email.split('@')[0],
          role: 'developer' as const,
          onboarding_completed: false,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  jwt: {
    maxAge: 24 * 60 * 60,
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.role = user.role ?? 'developer';
        token.onboarding_completed = user.onboarding_completed ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as SessionUser).id = token.id as string;
        (session.user as SessionUser).role = token.role ?? 'developer';
        (session.user as SessionUser).onboarding_completed = token.onboarding_completed ?? false;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'neuralgrid-dev-secret',
};
