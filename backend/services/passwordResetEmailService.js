const nodemailer = require('nodemailer');

let transporter;

const parseBoolean = (value) => String(value || '').toLowerCase() === 'true';

const getTransporter = () => {
  if (transporter) return transporter;

  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '');

  if (!host || !Number.isFinite(port) || port <= 0) {
    throw new Error('Password reset email delivery is not configured.');
  }

  if (Boolean(user) !== Boolean(pass)) {
    throw new Error('SMTP_USER and SMTP_PASS must either both be set or both be omitted.');
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: parseBoolean(process.env.SMTP_SECURE),
    ...(user ? { auth: { user, pass } } : {})
  });

  return transporter;
};

const getPasswordResetBaseUrl = () => {
  const configuredUrl = String(
    process.env.PASSWORD_RESET_BASE_URL
    || process.env.DASHBOARD_URL
    || ''
  ).trim();

  if (!configuredUrl) {
    throw new Error('PASSWORD_RESET_BASE_URL or DASHBOARD_URL must be configured.');
  }

  const baseUrl = new URL(configuredUrl);
  const isLocalhost = ['localhost', '127.0.0.1'].includes(baseUrl.hostname);
  if (baseUrl.protocol !== 'https:' && !isLocalhost) {
    throw new Error('Password reset links must use HTTPS outside localhost.');
  }

  return baseUrl.origin;
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const renderPasswordResetEmail = ({ resetUrl, expiresInMinutes }) => {
  const safeUrl = escapeHtml(resetUrl);
  const safeExpiry = escapeHtml(expiresInMinutes);
  const text = [
    'DestinAsian Ad Server',
    '',
    'Reset your password',
    'A password reset was requested for your account.',
    '',
    `Use the Reset password button in the HTML version of this email within ${expiresInMinutes} minutes.`,
    'This link can only be used once. If you did not request this reset, you can safely ignore this email.'
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Reset your DestinAsian Ad Server password</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f6f7;color:#172033;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f6f7;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#fffdf9;border:1px solid #e2e8ea;border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(23,32,51,.08);">
            <tr>
              <td style="padding:30px 36px 24px;border-bottom:1px solid #e8edef;">
                <div style="font-size:30px;line-height:1;font-weight:800;letter-spacing:-1.2px;color:#111827;">DestinAsian</div>
                <div style="margin-top:7px;font-size:15px;font-weight:700;color:#12a99a;">Ad Server Dashboard</div>
              </td>
            </tr>
            <tr>
              <td style="padding:36px;">
                <div style="display:inline-block;padding:7px 11px;border-radius:999px;background:#e8f7f5;color:#087f75;font-size:12px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;">Secure account action</div>
                <h1 style="margin:22px 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.15;color:#111827;">Reset your password</h1>
                <p style="margin:0 0 26px;font-size:16px;line-height:1.7;color:#5b6473;">We received a request to reset the password for your DestinAsian Ad Server account. Use the secure button below to continue.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;">
                  <tr>
                    <td bgcolor="#111827" style="border-radius:10px;">
                      <a href="${safeUrl}" style="display:inline-block;padding:15px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Reset password</a>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:26px;background:#f1f8f7;border-left:4px solid #12a99a;border-radius:8px;">
                  <tr>
                    <td style="padding:16px 18px;font-size:14px;line-height:1.6;color:#344054;">
                      This one-time link expires in <strong>${safeExpiry} minutes</strong>. After a successful reset, existing sessions will be signed out automatically.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 36px;background:#111827;color:#c7ced8;font-size:12px;line-height:1.6;">
                If you did not request this change, no action is required. Never forward this email or share the reset link.
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0;font-size:11px;color:#98a2b3;">DestinAsian Ad Server · Automated security message</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { text, html };
};

const sendPasswordResetEmail = async ({ recipient, resetToken, expiresInMinutes }) => {
  const mailFrom = String(process.env.MAIL_FROM || '').trim();
  if (!mailFrom) {
    throw new Error('MAIL_FROM must be configured for password reset delivery.');
  }

  const resetUrl = new URL('/reset-password', getPasswordResetBaseUrl());
  resetUrl.searchParams.set('token', resetToken);
  const content = renderPasswordResetEmail({
    resetUrl: resetUrl.toString(),
    expiresInMinutes
  });

  await getTransporter().sendMail({
    from: mailFrom,
    to: recipient,
    subject: 'Reset your DestinAsian Ad Server password',
    text: content.text,
    html: content.html
  });
};

module.exports = { sendPasswordResetEmail, renderPasswordResetEmail };
