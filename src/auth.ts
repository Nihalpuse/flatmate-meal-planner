import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";

import { authConfig } from "@/auth.config";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { signInSchema } from "@/lib/auth/validation";
import { currentAuthState, isTokenVersionCurrent, markEmailVerified } from "@/lib/auth-state";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Overrides the edge-safe jwt callback from auth.config with one that can reach
     * the database, which is what makes stateless sessions revocable.
     *
     * It lives here rather than in auth.config because that config is also what the
     * proxy runs at the edge, where there is no database. The proxy therefore only
     * checks that a token decrypts — a revoked one still passes its gate. That is
     * fine: it is a coarse filter, and every page and action calls auth() from this
     * module, where the version is checked and a stale token is rejected outright.
     */
    async jwt({ token, user, account }) {
      if (user?.id) {
        // Auth.js creates OAuth users with emailVerified: null regardless of what the
        // provider said (see handle-login.js), so Google users would otherwise be
        // stuck behind the verification gate forever. Google does tell us, via the
        // OIDC email_verified claim — signIn refuses the sign-in when it is false, so
        // reaching here means the address is confirmed.
        if (account?.provider === "google") {
          await markEmailVerified(user.id);
        }

        const state = await currentAuthState(user.id);
        token.id = user.id;
        token.v = state?.version ?? 0;
        token.ev = state?.emailConfirmed ?? false;
        return token;
      }

      // Auth.js types the token as Record<string, unknown>, and it is reconstructed
      // from a cookie, so narrow rather than assert. A token carrying no id cannot be
      // checked; the session callback then leaves user.id unset and every page turns
      // that into a redirect to /login.
      const userId = typeof token.id === "string" ? token.id : null;
      if (!userId) return token;
      const stamped = typeof token.v === "number" ? token.v : undefined;

      // The version moved on without us, or the user is gone: this token is dead.
      // Returning null makes Auth.js drop the session and clear the cookie.
      const state = await currentAuthState(userId);
      if (!isTokenVersionCurrent(stamped, state?.version ?? null)) return null;

      // Re-stamped from the cache on every request rather than trusted from the token,
      // so verifying takes effect on the very next page load instead of at next login.
      token.ev = state?.emailConfirmed ?? false;
      return token;
    },
    /**
     * Refuse a Google sign-in whose address Google itself has not confirmed. Without
     * this, the email_verified claim is ignored and an unverified Google address would
     * sail past the gate the credentials flow has to earn.
     */
    signIn({ account, profile }) {
      if (account?.provider !== "google") return true;
      return profile?.email_verified === true;
    },
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const rows = await db
          .select()
          .from(users)
          .where(eq(users.email, parsed.data.email))
          .limit(1);
        const user = rows[0];
        if (!user?.password) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.password);
        if (!ok) return null;

        return { id: user.id, name: user.name, email: user.email };
      },
    }),
    /**
     * No allowDangerousEmailAccountLinking.
     *
     * With it on, signing in with Google silently attaches the Google identity to
     * any existing user row with the same email. Since credentials signup never
     * verifies the address, anyone could register victim@example.com with a password
     * of their choosing, wait for the real owner to sign in with Google, and then log
     * into the linked account with that password. Auth.js now refuses the link and
     * reports OAuthAccountNotLinked, which the login page explains.
     *
     * Re-enabling this is only safe once credentials signup verifies the email.
     */
    Google,
  ],
});
