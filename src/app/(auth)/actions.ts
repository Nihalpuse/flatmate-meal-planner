"use server";

import { eq } from "drizzle-orm";
import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";

import { signIn as authSignIn, signOut as authSignOut } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { signInSchema, signUpSchema } from "@/lib/auth/validation";
import { isUniqueViolation } from "@/lib/db-errors";
import { EmailNotSentError } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/send-verification";
import { clientIp } from "@/server/client-ip";

export type AuthState = { error?: string; message?: string };

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Two budgets, deliberately. The per-email one stops a password brute force on a
  // single account; it does nothing against credential stuffing, where each attempt
  // uses a different email and so gets a fresh bucket. The per-IP one covers that.
  const ip = await clientIp();
  if (ip && !(await checkRateLimit(`signin-ip:${ip}`, 20, 60_000))) {
    return { error: "Too many attempts. Try again in a minute." };
  }
  if (!(await checkRateLimit(`signin:${parsed.data.email}`, 5, 60_000))) {
    return { error: "Too many attempts. Try again in a minute." };
  }

  try {
    await authSignIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) return { error: "Invalid email or password" };
    throw error;
  }
  return {};
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Keyed only on the email, signup had no effective limit at all: an attacker just
  // uses a fresh address each time and never touches the same bucket twice. The IP
  // budget is what actually caps account creation. Generous enough for a flat whose
  // members all sign up from the same wifi.
  const ip = await clientIp();
  if (ip && !(await checkRateLimit(`signup-ip:${ip}`, 10, 60 * 60_000))) {
    return { error: "Too many sign-ups from this network. Try again later." };
  }
  if (!(await checkRateLimit(`signup:${parsed.data.email}`, 3, 60_000))) {
    return { error: "Too many attempts. Try again in a minute." };
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);
  if (existing.length > 0) {
    return { error: "An account with this email already exists" };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  try {
    await db.insert(users).values({
      name: parsed.data.name,
      email: parsed.data.email,
      password: passwordHash,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "An account with this email already exists" };
    }
    throw error;
  }

  // Send before signing in. If the mail cannot go out we still let them in — the
  // account exists either way, and /verify-email offers a resend. Swallowing the
  // failure here beats leaving a user with an account they were never told how to
  // confirm.
  try {
    await sendVerificationEmail(parsed.data.email);
  } catch (error) {
    if (!(error instanceof EmailNotSentError)) throw error;
    console.error("Verification email failed at signup", error);
  }

  try {
    await authSignIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/verify-email",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created — please log in." };
    }
    throw error;
  }
  return {};
}

export async function signOut(): Promise<void> {
  await authSignOut({ redirectTo: "/login" });
}

export async function signInWithGoogle(): Promise<void> {
  await authSignIn("google", { redirectTo: "/dashboard" });
}
