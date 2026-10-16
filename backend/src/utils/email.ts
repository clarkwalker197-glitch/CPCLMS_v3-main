import { env } from '../config/env';
import { AppError } from '../utils/errors';
import nodemailer from 'nodemailer';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  fromName?: string;
}

const EMAIL_UNAVAILABLE_MESSAGE = 'We could not send email right now. Try again later or contact the library.';

class ResendRejectedError extends Error {}

function getFromAddress(fromName?: string): string | undefined {
  if (!fromName || !env.EMAIL_FROM) return env.EMAIL_FROM;
  const address = env.EMAIL_FROM.match(/<([^<>]+)>/)?.[1] ?? env.EMAIL_FROM;
  return `${fromName} <${address}>`;
}

export async function sendEmail(email: OutgoingEmail): Promise<void> {
  const apiKey = env.RESEND_API_KEY ?? env.RESET_API_KEY;
  if (apiKey) {
    try {
      await sendWithResend(email, apiKey);
      return;
    } catch (error) {
      if (!(error instanceof ResendRejectedError)) throw error;
      if (!hasSmtpConfiguration()) throw new AppError(EMAIL_UNAVAILABLE_MESSAGE, 503);
      console.error('Resend rejected the email; attempting delivery through configured SMTP.');
      await sendWithSmtp(email);
      return;
    }
  }

  if (!hasSmtpConfiguration()) {
    console.error('Email delivery unavailable: Resend credentials are missing and SMTP configuration is incomplete.');
    throw new AppError(EMAIL_UNAVAILABLE_MESSAGE, 503);
  }

  await sendWithSmtp(email);
}

function hasSmtpConfiguration(): boolean {
  return Boolean(env.EMAIL_HOST && env.EMAIL_PORT && env.EMAIL_USER && env.EMAIL_PASS && env.EMAIL_FROM);
}

async function sendWithSmtp(email: OutgoingEmail): Promise<void> {
  try {
    const transporter = nodemailer.createTransport({
      host: env.EMAIL_HOST,
      port: env.EMAIL_PORT,
      secure: env.EMAIL_PORT === 465,
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
      socketTimeout: 30_000,
      auth: {
        user: env.EMAIL_USER,
        pass: env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: email.fromName && env.EMAIL_FROM
        ? { name: email.fromName, address: env.EMAIL_FROM.match(/<([^<>]+)>/)?.[1] ?? env.EMAIL_FROM }
        : env.EMAIL_FROM,
      to: email.to,
      subject: email.subject,
      text: email.text,
      ...(email.html ? { html: email.html } : {}),
    });
  } catch (error) {
    console.error('SMTP email delivery failed:', error instanceof Error ? error.message : error);
    throw new AppError(EMAIL_UNAVAILABLE_MESSAGE, 503);
  }
}

async function sendWithResend(email: OutgoingEmail, apiKey: string): Promise<void> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: getFromAddress(email.fromName),
        to: email.to,
        subject: email.subject,
        text: email.text,
        ...(email.html ? { html: email.html } : {}),
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error('Email delivery failed:', response.status, details);
      throw new ResendRejectedError('Resend rejected the email request.');
    }
  } catch (error) {
    if (error instanceof ResendRejectedError) throw error;
    if (error instanceof AppError) throw error;
    console.error('Email delivery failed:', error instanceof Error ? error.message : error);
    throw new AppError(EMAIL_UNAVAILABLE_MESSAGE, 503);
  }
}
