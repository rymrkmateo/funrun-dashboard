const nodemailer = require('nodemailer');

function isConfigured() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

let transporter;

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      pool: true,
      maxConnections: 3,
    });
  }
  return transporter;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function toHtml(text) {
  const body = escapeHtml(text).replace(/\r?\n/g, '<br>');
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;line-height:1.6">
<div style="font-size:26px;font-weight:800;letter-spacing:0.02em;margin-bottom:18px">FUN<span style="color:#e6bb00">RUN</span></div>
<div>${body}</div>
</div>`;
}

async function sendBulk(recipients, build) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const mail = getTransporter();
  const failed = [];
  let sent = 0;

  for (let i = 0; i < recipients.length; i += 3) {
    const chunk = recipients.slice(i, i + 3);
    const results = await Promise.allSettled(
      chunk.map((recipient) => {
        const { subject, text } = build(recipient);
        return mail.sendMail({ from, to: recipient.email, subject, text, html: toHtml(text) });
      })
    );
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        sent += 1;
      } else {
        failed.push({
          email: chunk[index].email,
          reason: (result.reason && result.reason.message) || 'Send failed',
        });
      }
    });
  }

  return { sent, failed };
}

module.exports = { isConfigured, sendBulk };
