import { env } from '../config/env';
import { AppError } from '../utils/errors';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

export async function sendEmail(email: OutgoingEmail): Promise<void> {
  if (!env.RESEND_API_KEY) {
    throw new AppError('Email service is not configured. Set RESEND_API_KEY.', 503);
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: email.to,
        subject: email.subject,
        text: email.text,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error('Email delivery failed:', response.status, details);
      throw new AppError('Unable to send the verification email. Please try again later.', 503);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Email delivery failed:', error instanceof Error ? error.message : error);
    throw new AppError('Unable to send the verification email. Please try again later.', 503);
  }
}
