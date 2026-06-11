"use server";

import { eq } from "drizzle-orm";
import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";

import { signIn as authSignIn, signOut as authSignOut } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { signInSchema, signUpSchema } from "@/lib/auth/validation";
import { isUniqueViolation } from "@/lib/db-errors";
import { rateLimit } from "@/lib/rate-limit";

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

  if (!rateLimit(`signin:${parsed.data.email}`, 5, 60_000)) {
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

  if (!rateLimit(`signup:${parsed.data.email}`, 3, 60_000)) {
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

  try {
    await authSignIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/onboarding",
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
