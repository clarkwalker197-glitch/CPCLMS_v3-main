import { Prisma } from '@prisma/client';
import { prisma } from '../config';

type ActivityClient = Prisma.TransactionClient;

interface ActivityLogInput {
  userId?: string | null;
  actorName?: string;
  action: string;
  description: string;
  entity: string;
  entityId?: string | null;
  ipAddress?: string;
  details?: Prisma.InputJsonObject;
}

export const ACTIVITY_LOG_RETENTION_DAYS = 60;
export const ACTIVITY_LOG_DELETION_GRACE_DAYS = 7;

const protectedActions = [
  'DELETE_BOOK',
  'DELETE_USER',
  'DEACTIVATE_MEMBER',
  'DEACTIVATE_USER',
  'BAN_MEMBER',
  'ROLE_CHANGE',
  'CHANGE_ROLE',
  'UPDATE_ROLE',
  'PERMISSION_CHANGE',
  'CHANGE_PERMISSIONS',
  'UPDATE_PERMISSIONS',
  'UPDATE_SETTINGS',
  'SYSTEM_SETTINGS_CHANGE',
];

export async function recordActivity(
  input: ActivityLogInput,
  client: ActivityClient = prisma,
) {
  const user = input.userId
    ? await client.user.findUnique({
        where: { id: input.userId },
        select: { firstName: true, lastName: true },
      })
    : null;
  const actorName = input.actorName
    || (user ? `${user.firstName} ${user.lastName}`.trim() : null)
    || 'System';

  return client.activityLog.create({
    data: {
      userId: input.userId ?? null,
      actorName,
      action: input.action,
      description: input.description,
      entity: input.entity,
      entityId: input.entityId ?? null,
      ipAddress: input.ipAddress,
      ...(input.details ? { details: input.details } : {}),
    },
  });
}

export async function purgeExpiredActivityLogs(now = new Date()) {
  const retentionCutoff = new Date(now.getTime() - ACTIVITY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const hardDeleteCutoff = new Date(now.getTime() - ACTIVITY_LOG_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);

  const softDeleted = await prisma.activityLog.updateMany({
    where: {
      deletedAt: null,
      createdAt: { lt: retentionCutoff },
      action: { notIn: protectedActions },
    },
    data: { deletedAt: now },
  });
  const hardDeleted = await prisma.activityLog.deleteMany({
    where: {
      deletedAt: { lte: hardDeleteCutoff },
      action: { notIn: protectedActions },
    },
  });

  return { softDeleted: softDeleted.count, hardDeleted: hardDeleted.count };
}
