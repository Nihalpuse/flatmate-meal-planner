"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { EmailNotSentError } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/send-verification";
import { clientIp } from "@/server/client-ip";

export type ResendState = { error?: string; sent?: boolean };

/**
 * Mail the signed-in user a fresh confirmation link.
 *
 * Rate limited hard on both the account and the network: this endpoint sends mail on
 * demand, so an unbounded one is a way to bill us and to use the app as a relay for
 * spamming somebody's inbox.
 */
export async function resendVerification(): Promise<ResendState> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) redirect("/login");
  if (session.user.emailConfirmed) redirect("/dashboard");

  const ip = await clientIp();
  if (ip && !(await checkRateLimit(`verify-ip:${ip}`, 10, 60 * 60_000))) {
    return { error: "Too many requests from this network. Try again later." };
  }
  if (!(await checkRateLimit(`verify:${session.user.id}`, 3, 60 * 60_000))) {
    return { error: "You've asked for a few of these. Try again in an hour." };
  }

  try {
    await sendVerificationEmail(session.user.email);
  } catch (error) {
    if (error instanceof EmailNotSentError) {
      return { error: "Could not send the email. Please try again shortly." };
    }
    throw error;
  }

  return { sent: true };
}
