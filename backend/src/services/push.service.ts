import webpush from 'web-push';
import { env } from '../config/env';
import { prisma } from '../config';
import { BadRequestError, ForbiddenError } from '../utils/errors';

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

const vapidPublicKey = env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = env.VAPID_PRIVATE_KEY;
const isConfigured = Boolean(vapidPublicKey && vapidPrivateKey);

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    vapidPublicKey,
    vapidPrivateKey,
  );
}

export async function getPushPublicKey(): Promise<{ enabled: boolean; publicKey?: string }> {
  return vapidPublicKey && vapidPrivateKey
    ? { enabled: true, publicKey: vapidPublicKey }
    : { enabled: false };
}

export async function savePushSubscription(
  userId: string,
  subscription: PushSubscriptionInput,
): Promise<void> {
  if (!isConfigured) throw new BadRequestError('Web Push is not configured on this server.');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, notificationsEnabled: true },
  });
  if (!user?.isActive || !user.notificationsEnabled) {
    throw new ForbiddenError('Enable account notifications before subscribing to system notifications.');
  }

  const endpoint = new URL(subscription.endpoint);
  if (endpoint.protocol !== 'https:') {
    throw new ForbiddenError('Push subscription endpoint must use HTTPS.');
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    update: {
      userId,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  });
}

export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  await sendPushToMany([userId], payload);
}

export async function sendPushToMany(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (!isConfigured || userIds.length === 0) return;

  try {
    const users = await prisma.user.findMany({
      where: {
        id: { in: [...new Set(userIds)] },
        isActive: true,
        notificationsEnabled: true,
      },
      select: {
        pushSubscriptions: {
          select: { id: true, endpoint: true, p256dh: true, auth: true },
        },
      },
    });

    const serializedPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      tag: payload.tag,
      url: payload.url,
    });

    await Promise.all(users.flatMap(({ pushSubscriptions }) =>
      pushSubscriptions.map(async (subscription) => {
        const pushSubscription: webpush.PushSubscription = {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        };

        try {
          await webpush.sendNotification(pushSubscription, serializedPayload);
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
            return;
          }
          console.error('Web Push delivery failed:', error);
        }
      }),
    ));
  } catch (error) {
    console.error('Unable to load subscriptions for Web Push delivery:', error);
  }
}
