import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string; emailConfirmed: boolean } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    /** Token version at issue time. Stale against the user's current one = revoked. */
    v?: number;
    /** Whether the address is confirmed. Re-stamped from the cache on every request. */
    ev?: boolean;
  }
}
