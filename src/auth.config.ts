import type { NextAuthConfig } from "next-auth";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/pantry",
  "/history",
  "/settings",
  "/onboarding",
  // Requires a session, but not a confirmed address — it is where unconfirmed users
  // land. Note "/verify" (the emailed link) is deliberately absent: it is opened on
  // whatever device has the inbox, which usually has no session at all.
  "/verify-email",
];

/** Edge-safe config: no DB, no providers — used by the proxy for route protection. */
export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  // Credentials sign-in forces the jwt strategy: @auth/core always encodes a token
  // for it and never calls adapter.createSession, so the sessions table can never be
  // used while password login exists. 7 days rather than the 30-day default, because
  // a stolen cookie stays usable for the whole window. Revocation before that window
  // is up is handled by the token version — see lib/auth-state.ts.
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;
      const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
      if (isProtected && !isLoggedIn) return false;
      return true;
    },
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      // Re-stamped onto the token from the cache on every request (see auth.ts), so
      // pages can gate on a confirmed address without paying a query for it.
      session.user.emailConfirmed = token.ev === true;
      return session;
    },
  },
} satisfies NextAuthConfig;
