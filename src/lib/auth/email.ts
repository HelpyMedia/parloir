/**
 * Transactional email for sign-up verification, via Resend's HTTP API.
 *
 * Optional: when RESEND_API_KEY is unset, email verification is off and
 * sign-up works without it (self-hosting default). The hosted service sets
 * it so throwaway signups can't create accounts in bulk.
 */

const RESEND_URL = "https://api.resend.com/emails";

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function fromAddress(): string {
  return process.env.PARLOIR_EMAIL_FROM || "Parloir <no-reply@parloir.dev>";
}

export async function sendVerificationEmail(params: { to: string; url: string }): Promise<void> {
  const { to, url } = params;
  const html = `
<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1c1917">
  <h1 style="font-size:20px;margin:0 0 16px">Parloir</h1>
  <p>Confirm your email to start your first debate.<br>
  <span style="color:#57534e">Confirmez votre courriel pour lancer votre premier débat.</span></p>
  <p style="margin:24px 0">
    <a href="${url}" style="background:#d97706;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">
      Confirm email · Confirmer
    </a>
  </p>
  <p style="font-size:12px;color:#78716c">If you didn't create a Parloir account, ignore this message.<br>
  Si vous n'avez pas créé de compte Parloir, ignorez ce message.</p>
</div>`;

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to,
      subject: "Confirm your email · Confirmez votre courriel — Parloir",
      html,
      text: `Confirm your email / Confirmez votre courriel: ${url}`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error("[email] verification send failed", res.status, await res.text().catch(() => ""));
    throw new Error("Could not send the verification email.");
  }
}
