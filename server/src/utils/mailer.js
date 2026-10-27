const nodemailer = require('nodemailer');
const config = require('../config');

// In tests, emails are captured here so tests can read the tokens.
const outbox = [];
let transport;

function getTransport() {
  if (!transport) {
    transport = config.smtp.host
      ? nodemailer.createTransport({
          host: config.smtp.host,
          port: config.smtp.port,
          secure: config.smtp.port === 465,
          auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
        })
      : nodemailer.createTransport({ jsonTransport: true });
  }
  return transport;
}

// HTTPS email API. Hosts like Render's free tier block SMTP ports, so this is the production path.
async function sendViaBrevo({ to, subject, text }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: config.mailFrom, to: [{ email: to }], subject, textContent: text }),
  });
  if (!res.ok) throw new Error(`Brevo responded ${res.status}: ${await res.text()}`);
}

async function sendMail({ to, subject, text }) {
  if (config.isTest) {
    outbox.push({ to, subject, text });
    return;
  }
  try {
    if (config.brevoApiKey) {
      await sendViaBrevo({ to, subject, text });
    } else {
      await getTransport().sendMail({ from: config.smtp.from, to, subject, text });
      if (!config.smtp.host) {
        console.log(`\n--- DEV EMAIL to ${to} ---\n${subject}\n\n${text}\n--------------------------\n`);
      }
    }
  } catch (err) {
    // A mail outage should not turn sign-up into a 500; users can request a new link.
    console.error('Email delivery failed:', err.message);
  }
}

const sendVerificationEmail = (user, token) =>
  sendMail({
    to: user.email,
    subject: 'Verify your email',
    text: `Hi ${user.name},\n\nConfirm your email address:\n${config.clientUrl}/verify-email?token=${token}\n\nThis link expires in 24 hours.`,
  });

const sendPasswordResetEmail = (user, token) =>
  sendMail({
    to: user.email,
    subject: 'Reset your password',
    text: `Hi ${user.name},\n\nReset your password:\n${config.clientUrl}/reset-password?token=${token}\n\nThis link expires in 30 minutes. If you did not ask for this, ignore this email.`,
  });

module.exports = { outbox, sendVerificationEmail, sendPasswordResetEmail };
