// email.service.ts — transactional email via Resend REST API.
// Falls back to console logging when RESEND_API_KEY is not configured so the
// app stays fully functional in local/dev environments without email credentials.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey: string | null;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService) {
    const key = config.get<string>('RESEND_API_KEY', '');
    this.apiKey = key && key !== 'change_me' ? key : null;
    this.from = config.get<string>('EMAIL_FROM', 'no-reply@glondia.app');
    this.appUrl = config.get<string>('FRONTEND_URL', 'http://localhost:5173');

    if (!this.apiKey) {
      this.logger.warn('Resend API key not configured — emails will be logged but not sent.');
    }
  }

  // ─── Core send ────────────────────────────────────────────────────────────────

  async send(input: SendEmailInput): Promise<void> {
    if (!this.apiKey) {
      this.logger.log(`[email-noop] To: ${input.to} | Subject: ${input.subject}`);
      return;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        this.logger.error(`Resend API error ${response.status}: ${JSON.stringify(payload)}`);
      }
    } catch (err) {
      this.logger.error(`Failed to send email to ${input.to}: ${(err as Error).message}`);
    }
  }

  // ─── Invite email ─────────────────────────────────────────────────────────────

  sendInvite(input: {
    to: string;
    inviterName: string | null;
    organizationName: string;
    token: string;
  }): Promise<void> {
    const inviter = input.inviterName ?? 'Someone';
    const acceptUrl = `${this.appUrl}/invite/${input.token}`;

    return this.send({
      to: input.to,
      subject: `You've been invited to join ${input.organizationName} on Glondia`,
      html: `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:0 20px;color:#1a1a1a;">
  <h2 style="font-size:22px;font-weight:700;margin-bottom:8px;">You've been invited</h2>
  <p style="color:#555;line-height:1.6;">
    <strong>${esc(inviter)}</strong> has invited you to join
    <strong>${esc(input.organizationName)}</strong> on Glondia.
  </p>
  <a href="${acceptUrl}"
     style="display:inline-block;margin-top:24px;padding:12px 28px;background:#22c55e;
            color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">
    Accept invite
  </a>
  <p style="margin-top:28px;font-size:12px;color:#999;">
    This invite expires in 7 days. If you didn't expect this, you can safely ignore this email.
  </p>
</body>
</html>`,
      text: `${inviter} has invited you to join ${input.organizationName} on Glondia.\n\nAccept your invite: ${acceptUrl}\n\nThis invite expires in 7 days.`,
    });
  }

  // ─── Deployment notification ──────────────────────────────────────────────────

  sendDeploymentNotification(input: {
    to: string;
    projectName: string;
    status: 'deployed' | 'failed';
    deploymentId: string;
    errorMessage?: string;
  }): Promise<void> {
    const succeeded = input.status === 'deployed';
    const subject = succeeded
      ? `✓ Deployment succeeded — ${input.projectName}`
      : `✗ Deployment failed — ${input.projectName}`;

    return this.send({
      to: input.to,
      subject,
      html: `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:0 20px;color:#1a1a1a;">
  <h2 style="font-size:22px;font-weight:700;color:${succeeded ? '#22c55e' : '#dc2626'};">
    Deployment ${succeeded ? 'succeeded' : 'failed'}
  </h2>
  <p><strong>Project:</strong> ${esc(input.projectName)}</p>
  ${input.errorMessage ? `<p style="color:#dc2626;"><strong>Error:</strong> ${esc(input.errorMessage)}</p>` : ''}
  <p style="font-size:12px;color:#999;">Deployment ID: ${input.deploymentId}</p>
</body>
</html>`,
      text: succeeded
        ? `Deployment of ${input.projectName} succeeded.`
        : `Deployment of ${input.projectName} failed.\n\n${input.errorMessage ?? 'Unknown error'}`,
    });
  }

  // ─── Password reset ───────────────────────────────────────────────────────────

  sendPasswordReset(input: { to: string; token: string; name: string | null }): Promise<void> {
    const resetUrl = `${this.appUrl}/reset-password/${input.token}`;
    const greeting = input.name ? `Hi ${esc(input.name)},` : 'Hi,';

    return this.send({
      to: input.to,
      subject: 'Reset your Glondia password',
      html: `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:0 20px;color:#1a1a1a;">
  <h2 style="font-size:22px;font-weight:700;">Reset your password</h2>
  <p style="color:#555;line-height:1.6;">${greeting} Click below to reset your Glondia password.
     This link expires in 30 minutes.</p>
  <a href="${resetUrl}"
     style="display:inline-block;margin-top:24px;padding:12px 28px;background:#1a1f1d;
            color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">
    Reset password
  </a>
  <p style="margin-top:28px;font-size:12px;color:#999;">
    If you didn't request this, you can ignore this email.
  </p>
</body>
</html>`,
      text: `Reset your Glondia password: ${resetUrl}\n\nThis link expires in 30 minutes.`,
    });
  }
}

function esc(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
