import { z } from 'zod';

const endpointSchema = z.string().url().max(2048).refine(
  (value) => new URL(value).protocol === 'https:',
  'Push subscription endpoint must use HTTPS',
);

export const pushSubscriptionSchema = z.object({
  body: z.object({
    endpoint: endpointSchema,
    keys: z.object({
      p256dh: z.string().min(1).max(255),
      auth: z.string().min(1).max(255),
    }),
  }),
});

export const pushUnsubscriptionSchema = z.object({
  body: z.object({ endpoint: endpointSchema }),
});
