import { prisma } from '../config';
import { tryDeleteUnreferencedCoverImage } from './cover-image-storage.service';
import { tryDeleteUnreferencedEBookFile } from './ebook-file-storage.service';

export const ARCHIVE_RETENTION_DAYS = 15;
export const INACTIVE_USER_ARCHIVE_DAYS = 90;

export class ArchiveRetentionService {
  async archiveInactiveUsers(now = new Date()) {
    const cutoff = new Date(now.getTime() - INACTIVE_USER_ARCHIVE_DAYS * 24 * 60 * 60 * 1000);
    const archivedAt = now;
    const archivedCount = await prisma.$transaction(async (tx) => {
      const inactiveUsers = await tx.user.findMany({
        where: {
          role: { in: ['STUDENT', 'FACULTY'] },
          isActive: true,
          archivedAt: null,
          OR: [
            { lastLoginAt: { lte: cutoff } },
            { lastLoginAt: null, createdAt: { lte: cutoff } },
          ],
        },
        select: { id: true },
      });
      if (inactiveUsers.length === 0) return 0;

      const result = await tx.user.updateMany({
        where: {
          id: { in: inactiveUsers.map(({ id }) => id) },
          role: { in: ['STUDENT', 'FACULTY'] },
          isActive: true,
          archivedAt: null,
          OR: [
            { lastLoginAt: { lte: cutoff } },
            { lastLoginAt: null, createdAt: { lte: cutoff } },
          ],
        },
        data: { isActive: false, archivedAt },
      });
      if (result.count === 0) return 0;

      const archivedUsers = await tx.user.findMany({
        where: {
          id: { in: inactiveUsers.map(({ id }) => id) },
          isActive: false,
          archivedAt,
        },
        select: { id: true, firstName: true, lastName: true, libraryId: true },
      });
      const userIds = archivedUsers.map(({ id }) => id);
      await tx.refreshToken.updateMany({
        where: { userId: { in: userIds }, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.activityLog.createMany({
        data: archivedUsers.map((user) => ({
          actorName: 'System',
          action: 'AUTO_ARCHIVE_INACTIVE_USER',
          description: `Automatically archived inactive account: ${user.firstName} ${user.lastName}`,
          entity: 'User',
          entityId: user.id,
          details: { libraryId: user.libraryId, inactivityDays: INACTIVE_USER_ARCHIVE_DAYS },
        })),
      });
      return archivedUsers.length;
    });

    return { archived: archivedCount };
  }

  async purgeExpiredArchives() {
    const cutoff = new Date();
    cutoff.setTime(cutoff.getTime() - ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const jobs = [
      {
        name: 'Book',
        model: prisma.book,
        where: {
          deletedAt: { not: null },
          OR: [
            { archivedAt: { lte: cutoff } },
            { archivedAt: null, deletedAt: { lte: cutoff } },
          ],
        },
        includeCover: true,
        includeEBookFile: false,
        canDelete: async (id: string) => {
          const [activeTransactions, activeReservations, pendingRequests] = await Promise.all([
            prisma.borrowTransaction.count({ where: { bookId: id, status: { in: ['ACTIVE', 'OVERDUE'] } } }),
            prisma.reservation.count({ where: { bookId: id, status: { in: ['ACTIVE', 'APPROVED'] } } }),
            prisma.borrowRequest.count({ where: { bookId: id, status: 'PENDING' } }),
          ]);
          return activeTransactions === 0 && activeReservations === 0 && pendingRequests === 0;
        },
      },
      {
        name: 'EBook',
        model: prisma.eBook,
        where: {
          deletedAt: { not: null },
          OR: [
            { archivedAt: { lte: cutoff } },
            { archivedAt: null, deletedAt: { lte: cutoff } },
          ],
        },
        includeCover: true,
        includeEBookFile: true,
      },
      {
        name: 'User',
        model: prisma.user,
        where: {
          isActive: false,
          OR: [
            { archivedAt: { lte: cutoff } },
            { archivedAt: null, updatedAt: { lte: cutoff } },
          ],
        },
        includeCover: false,
        includeEBookFile: false,
        canDelete: async (id: string) => {
          const [activeTransactions, activeReservations, pendingRequests] = await Promise.all([
            prisma.borrowTransaction.count({ where: { userId: id, status: { in: ['ACTIVE', 'OVERDUE'] } } }),
            prisma.reservation.count({ where: { userId: id, status: { in: ['ACTIVE', 'APPROVED'] } } }),
            prisma.borrowRequest.count({ where: { userId: id, status: 'PENDING' } }),
          ]);
          return activeTransactions === 0 && activeReservations === 0 && pendingRequests === 0;
        },
      },
    ] as const;

    const results = { processed: 0, deleted: 0, blocked: 0, failed: 0 };

    for (const job of jobs) {
      try {
        const records = await (job.model as any).findMany({
          where: job.where,
          select: {
            id: true,
            archivedAt: true,
            ...(job.includeCover ? { coverImage: true } : {}),
            ...(job.includeEBookFile ? { fileUrl: true } : {}),
          },
        });
        results.processed += records.length;

        for (const record of records) {
          try {
            if ('canDelete' in job && !(await job.canDelete(record.id))) {
              results.blocked += 1;
              console.warn(`Deferred purge of ${job.name} archive record ${record.id} because it has active circulation records.`);
              continue;
            }
            await (job.model as any).delete({ where: { id: record.id } });
            results.deleted += 1;

            if (record.coverImage) await tryDeleteUnreferencedCoverImage(record.coverImage);
            if (record.fileUrl) await tryDeleteUnreferencedEBookFile(record.fileUrl);
          } catch (error) {
            results.failed += 1;
            console.error(`Failed to purge expired ${job.name} archive record ${record.id}:`, error);
          }
        }
      } catch (error) {
        results.failed += 1;
        console.error(`Failed while scanning expired ${job.name} archive records:`, error);
      }
    }

    return results;
  }
}

export const archiveRetentionService = new ArchiveRetentionService();
