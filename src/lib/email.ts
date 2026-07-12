import { env } from "@/env";

/**
 * Minimal Resend transport.
 *
 * Uses Resend's REST endpoint over fetch rather than the SDK: it is one POST, and a
 * dependency that only wraps one POST is not worth the supply-chain surface.
 *
 * Optional, like Redis. Without RESEND_API_KEY the mail is written to the server log
 * instead, so signup and the verification flow still work end to end in local
 * development without anyone owning a sending domain. That fallback is a development
 * convenience and refuses to stand in for a real transport in production, where a
 * silently-unsent verification mail would lock every new user out of the app.
 */
export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export class EmailNotSentError extends Error {}

export function isEmailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

export async function sendEmail(mail: Mail): Promise<void> {
  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new EmailNotSentError("RESEND_API_KEY and EMAIL_FROM are not configured");
    }
    console.info(
      `\n[email:dev] to=${mail.to} subject=${mail.subject}\n${mail.text}\n`,
    );
    return;
  }

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    });
  } catch (cause) {
    throw new EmailNotSentError("Could not reach the email provider", { cause });
  }

  if (!response.ok) {
    throw new EmailNotSentError(
      `Email provider rejected the message (${response.status})`,
    );
  }
}
