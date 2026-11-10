import config from "../config";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export interface InviteEmailTemplateData {
  inviterName: string;
  orgName: string;
  role: string;
  projectName?: string | null;
  token: string;
}

/**
 * Sends an email using the Resend HTTP API via native fetch.
 * - If RESEND_API_KEY is missing, logs the email and link to the console (local dev mode).
 * - Catches any error, logs it, and returns false so that email failures never crash a request.
 * - Awaited by callers so serverless lambdas do not terminate background tasks.
 */
export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<boolean> {
  const apiKey = config.resendApiKey;
  const from = config.emailFrom || "DevPulse <noreply@devpulse.app>";

  // Local development fallback: log email to console
  if (!apiKey) {
    console.log("--------------------------------------------------");
    console.log("📧 [DEV EMAIL SERVICE] Resend API key not configured");
    console.log(`To: ${to}`);
    console.log(`From: ${from}`);
    console.log(`Subject: ${subject}`);
    console.log("Body:");
    console.log(html);
    console.log("--------------------------------------------------");
    return true;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Resend API error (${response.status}):`, errorText);
      return false;
    }

    return true;
  } catch (error) {
    console.error("sendEmail failed:", error);
    return false;
  }
}

/**
 * Generates email subject and HTML template for organization or client project invitations.
 */
export function renderInviteEmail(data: InviteEmailTemplateData): { subject: string; html: string } {
  const { inviterName, orgName, role, projectName, token } = data;
  const baseAppUrl = (config.appUrl || "http://localhost:5173").replace(/\/+$/, "");
  const inviteUrl = `${baseAppUrl}/invite/${token}`;

  const isClientInvite = !!projectName || role === "guest";
  const roleDisplay = isClientInvite ? "Client" : role.charAt(0).toUpperCase() + role.slice(1);

  const subject = isClientInvite
    ? `${inviterName} invited you to project ${projectName} on DevPulse`
    : `${inviterName} invited you to join ${orgName} on DevPulse`;

  const descriptionHtml = isClientInvite
    ? `<strong>${inviterName}</strong> has invited you to collaborate on the project <strong>${projectName}</strong> at <strong>${orgName}</strong> as a <strong>Client</strong>.`
    : `<strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> as a <strong>${roleDisplay}</strong>.`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f4f5f7; margin: 0; padding: 24px; color: #172b4d; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
    .header { font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 16px; }
    .content { font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 28px; }
    .btn-container { text-align: center; margin: 32px 0; }
    .btn { background-color: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 15px; display: inline-block; }
    .footer { font-size: 13px; color: #64748b; border-top: 1px solid #f1f5f9; padding-top: 20px; line-height: 1.5; }
    .link-fallback { word-break: break-all; color: #2563eb; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">DevPulse Invitation</div>
    <div class="content">
      <p>Hello,</p>
      <p>${descriptionHtml}</p>
      <div class="btn-container">
        <a href="${inviteUrl}" class="btn" target="_blank" rel="noopener noreferrer">Accept Invitation</a>
      </div>
      <p>This invitation link is valid for <strong>7 days</strong>.</p>
    </div>
    <div class="footer">
      <p>If the button above does not work, copy and paste this link into your browser:</p>
      <p class="link-fallback"><a href="${inviteUrl}">${inviteUrl}</a></p>
      <p>If you were not expecting this invitation, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, html };
}

/**
 * Helper to build and send an invitation email.
 */
export async function sendInviteEmail(data: InviteEmailTemplateData & { to: string }): Promise<boolean> {
  const { subject, html } = renderInviteEmail(data);
  return await sendEmail({ to: data.to, subject, html });
}

