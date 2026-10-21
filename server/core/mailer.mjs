/* Mail delivery.
   log  : local and tests. One JSON line per message in <dataDir>/mail.log plus a
          console copy, so the reset link can be followed without a provider.
   resend: production, plain fetch, no dependency.
   A mail failure must never change the HTTP answer: the API replies the same
   thing whether or not the provider is having a bad day. */

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.mjs';

export async function sendMail({ to, subject, text }) {
  if (config.mailMode === 'resend') return sendWithResend({ to, subject, text });
  return sendToLog({ to, subject, text });
}

function sendToLog({ to, subject, text }) {
  try {
    mkdirSync(config.dataDir, { recursive: true });
    appendFileSync(join(config.dataDir, 'mail.log'), JSON.stringify({ to, subject, text, at: Date.now() }) + '\n');
  } catch (err) {
    console.warn('[mail] no se pudo escribir mail.log:', err.message);
  }
  console.log('[mail] %s -> %s\n%s\n', subject, to, text);
}

async function sendWithResend({ to, subject, text }) {
  if (!config.resendApiKey) {
    console.warn('[mail] MAIL_MODE=resend sin RESEND_API_KEY: el correo no se envía');
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + config.resendApiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ from: config.mailFrom, to: [to], subject, text })
    });
    if (!res.ok) console.warn('[mail] Resend respondió', res.status);
  } catch (err) {
    console.warn('[mail] fallo al enviar:', err.message);
  }
}
