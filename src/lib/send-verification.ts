import { env } from "@/env";
import { issueVerificationToken } from "@/lib/email-verification";
import { sendEmail } from "@/lib/email";

/**
 * Mint a verification link for an address and mail it.
 *
 * Shared by signup and the resend flow so the link, the copy and the expiry can never
 * drift apart between them. Throws EmailNotSentError if the mail could not be handed
 * off; callers decide what to tell the user.
 */
export async function sendVerificationEmail(email: string): Promise<void> {
  const token = await issueVerificationToken(email);
  const link = `${env.NEXT_PUBLIC_APP_URL}/verify?token=${token}`;

  await sendEmail({
    to: email,
    subject: "Confirm your email — Aaj Kya Banega?",
    text: [
      "Confirm your email to start planning meals with your flat.",
      "",
      link,
      "",
      "This link expires in 24 hours. If you didn't sign up, ignore this email.",
    ].join("\n"),
    html: `
      <p>Confirm your email to start planning meals with your flat.</p>
      <p><a href="${link}">Confirm my email</a></p>
      <p>Or paste this into your browser:<br><code>${link}</code></p>
      <p>This link expires in 24 hours. If you didn't sign up, ignore this email.</p>
    `,
  });
}
