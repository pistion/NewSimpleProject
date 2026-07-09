/**
 * sendEmail.tool.js
 * Sends email via SendGrid HTTP API (no npm needed).
 */

const FROM_EMAIL = () => process.env.BUSINESS_EMAIL   || process.env.EMAIL_FROM || '';
const FROM_NAME  = () => process.env.EMAIL_FROM_NAME  || 'HEYA Talent Solutions';
const SG_KEY     = () => process.env.SENDGRID_API_KEY || '';

module.exports = {
  id:          'send_email',
  name:        'Send Email',
  provider:    'email',
  requiresConnection: false,
  description: 'Send an email to a recipient via the configured email provider.',
  parameters: {
    to:      { type: 'string', description: 'Recipient email address.' },
    subject: { type: 'string', description: 'Email subject line.' },
    body:    { type: 'string', description: 'Plain-text email body.' },
  },
  async execute({ to, subject, body }) {
    if (!to?.trim())      throw new Error('to is required');
    if (!subject?.trim()) throw new Error('subject is required');
    if (!body?.trim())    throw new Error('body is required');

    const apiKey = SG_KEY();
    if (!apiKey || apiKey.startsWith('replace-')) {
      throw new Error('SendGrid API key is not configured. Set SENDGRID_API_KEY in .env');
    }

    const payload = {
      personalizations: [{ to: [{ email: to.trim() }] }],
      from:    { email: FROM_EMAIL(), name: FROM_NAME() },
      subject: subject.trim(),
      content: [{ type: 'text/plain', value: body.trim() }],
    };

    const res  = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.errors?.[0]?.message || `Email send failed (HTTP ${res.status})`);
    }

    return { sent: true, to: to.trim(), subject: subject.trim() };
  },
};
