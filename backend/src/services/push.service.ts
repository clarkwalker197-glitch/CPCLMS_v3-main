import webpush from 'web-push';
import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../config';
import { ForbiddenError } from '../utils/errors';

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

export type PushPreference = 'notificationsEnabled' | 'systemNotificationsEnabled';

type VapidKeyPair = { publicKey: string; privateKey: string };

let cachedVapidKeys: VapidKeyPair | null = env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
  ? { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
  : null;

async function getVapidKeys(): Promise<VapidKeyPair> {
  if (!cachedVapidKeys) {
    const storedKeys = await prisma.webPushConfig.findUnique({ where: { id: 'default' } });
    if (storedKeys) {
      cachedVapidKeys = { publicKey: storedKeys.publicKey, privateKey: storedKeys.privateKey };
    } else {
      const generatedKeys = webpush.generateVAPIDKeys();
      try {
        const stored = await prisma.webPushConfig.create({
          data: {
            id: 'default',
            publicKey: generatedKeys.publicKey,
            privateKey: generatedKeys.privateKey,
          },
        });
        cachedVapidKeys = { publicKey: stored.publicKey, privateKey: stored.privateKey };
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
          throw error;
        }
        const concurrentlyStoredKeys = await prisma.webPushConfig.findUnique({ where: { id: 'default' } });
        if (!concurrentlyStoredKeys) throw error;
        cachedVapidKeys = {
          publicKey: concurrentlyStoredKeys.publicKey,
          privateKey: concurrentlyStoredKeys.privateKey,
        };
      }
    }
  }

  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    cachedVapidKeys.publicKey,
    cachedVapidKeys.privateKey,
  );
  return cachedVapidKeys;
}

export async function getPushPublicKey(): Promise<{ enabled: boolean; publicKey?: string }> {
  const keys = await getVapidKeys();
  return { enabled: true, publicKey: keys.publicKey };
}

export async function savePushSubscription(
  userId: string,
  subscription: PushSubscriptionInput,
): Promise<void> {
  await getVapidKeys();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true },
  });
  if (!user?.isActive) {
    throw new ForbiddenError('An active account is required to subscribe to notifications.');
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
  preference: PushPreference = 'notificationsEnabled',
): Promise<void> {
  await sendPushToMany([userId], payload, preference);
}

export async function sendPushToMany(
  userIds: string[],
  payload: PushPayload,
  preference: PushPreference = 'notificationsEnabled',
): Promise<void> {
  if (userIds.length === 0) return;

  try {
    await getVapidKeys();
    const users = await prisma.user.findMany({
      where: {
        id: { in: [...new Set(userIds)] },
        isActive: true,
        ...(preference === 'systemNotificationsEnabled'
          ? { systemNotificationsEnabled: true }
          : { notificationsEnabled: true }),
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
