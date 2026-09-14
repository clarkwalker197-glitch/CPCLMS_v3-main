import { Prisma } from '@prisma/client';
import { prisma } from '../config';

export const ARCHIVE_RETENTION_DAYS = 15;

export class ArchiveRetentionService {
  async purgeExpiredArchives() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ARCHIVE_RETENTION_DAYS);

    const jobs = [
      {
        name: 'Book',
        model: prisma.book,
        where: { deletedAt: { not: null }, archivedAt: { lte: cutoff } },
      },
      {
        name: 'EBook',
        model: prisma.eBook,
        where: { deletedAt: { not: null }, archivedAt: { lte: cutoff } },
      },
      {
        name: 'User',
        model: prisma.user,
        where: { isActive: false, archivedAt: { lte: cutoff } },
      },
    ] as const;

    const results = { processed: 0, deleted: 0, failed: 0 };

    for (const job of jobs) {
      try {
        const records = await (job.model as any).findMany({ where: job.where, select: { id: true, archivedAt: true } });
        results.processed += records.length;

        for (const record of records) {
          try {
            await (job.model as any).delete({ where: { id: record.id } });
            results.deleted += 1;

            await prisma.activityLog.create({
              data: {
                userId: null,
                action: 'SYSTEM',
                entity: job.name,
                entityId: record.id,
                details: {
                  type: 'ARCHIVE_RETENTION_PURGE',
                  archivedAt: record.archivedAt,
                  deletedAt: new Date().toISOString(),
                  retentionDays: ARCHIVE_RETENTION_DAYS,
                },
              },
            });
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
