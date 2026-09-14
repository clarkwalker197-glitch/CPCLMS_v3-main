import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { AppError } from './errors';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
  },
});

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

export async function sendEmail(email: OutgoingEmail): Promise<void> {
  if (!env.EMAIL_USER || !env.EMAIL_PASS) {
    throw new AppError('Email service is not configured. Set EMAIL_USER and EMAIL_PASS.', 503);
  }

  try {
    await transporter.sendMail({
      from: env.EMAIL_USER,
      to: email.to,
      subject: email.subject,
      text: email.text,
    });
  } catch (error) {
    console.error('Email delivery failed:', error instanceof Error ? error.message : error);
    throw new AppError('Unable to send the verification email. Please try again later.', 503);
  }
}
