// ============================================================
// E-Book Service — Full CRUD with search, filter, pagination
// ============================================================

import { prisma } from '../config';
import { NotFoundError, ConflictError, BadRequestError } from '../utils/errors';
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination';
import { normalizeClassificationNumber } from '../constants/categories';
import { getSortParams } from '../utils/sorting';

export class EBookService {
  /**
   * List e-books with search, filter, and pagination
   */
  async listEBooks(query: Record<string, unknown>) {
    const { page, limit, skip, take } = getPaginationParams(query);
    const { sort, order } = getSortParams(query, ['title', 'author', 'classification', 'createdAt', 'availability', 'views'] as const, 'title', 'asc');

    const where: Record<string, unknown> = { deletedAt: null };

    // Search by title, author, ISBN, or Dewey classification
    if (query.search) {
      const search = query.search as string;
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { author: { contains: search, mode: 'insensitive' } },
        { isbn: { contains: search } },
        { classificationNumber: { contains: search } },
      ];
    }

    // Filter by category
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.categoryMain) {
      where.mainCategory = String(query.categoryMain);
    }

    if (query.classificationNumber) {
      where.classificationNumber = { contains: query.classificationNumber };
    }

    // Filter by format
    if (query.format) {
      where.format = query.format;
    }

    // Filter by language
    if (query.language) {
      where.language = query.language;
    }

    const [ebooks, total] = await Promise.all([
      prisma.eBook.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
        orderBy: sort === 'availability'
          ? [{ status: order === 'asc' ? 'asc' : 'desc' }, { title: 'asc' }, { id: 'asc' }]
          : sort === 'views'
            ? [{ views: { _count: order } }, { title: 'asc' }, { id: 'asc' }]
          : [{ [sort === 'classification' ? 'classificationNumber' : sort]: order }, { id: 'asc' }],
        skip,
        take,
      }),
      prisma.eBook.count({ where }),
    ]);
    const viewSummaries = await this.getViewSummaries(ebooks.map(({ id }) => id));

    return {
      ebooks: ebooks.map((ebook) => ({
        ...ebook,
        totalViews: viewSummaries.get(ebook.id)?.totalViews ?? 0,
        uniqueViewers: viewSummaries.get(ebook.id)?.uniqueViewers ?? 0,
      })),
      meta: buildPaginationMeta(total, { page, limit, skip, take }),
    };
  }

  private async getViewSummaries(ebookIds: string[]) {
    if (!ebookIds.length) return new Map<string, { totalViews: number; uniqueViewers: number }>();
    const [totals, uniqueUsers] = await Promise.all([
      prisma.eBookView.groupBy({
        by: ['ebookId'],
        where: { ebookId: { in: ebookIds } },
        _count: { _all: true },
      }),
      prisma.eBookView.findMany({
        where: { ebookId: { in: ebookIds } },
        select: { ebookId: true, userId: true },
        distinct: ['ebookId', 'userId'],
      }),
    ]);
    const uniqueCounts = new Map<string, number>();
    uniqueUsers.forEach(({ ebookId }) => uniqueCounts.set(ebookId, (uniqueCounts.get(ebookId) ?? 0) + 1));
    return new Map(ebookIds.map((id) => [id, {
      totalViews: totals.find((item) => item.ebookId === id)?._count._all ?? 0,
      uniqueViewers: uniqueCounts.get(id) ?? 0,
    }]));
  }

  /**
   * Get a single e-book by ID
   */
  async getEBookById(id: string) {
    const ebook = await prisma.eBook.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!ebook) throw new NotFoundError('E-Book');
    const views = await this.getViewSummaries([id]);
    return {
      ...ebook,
      totalViews: views.get(id)?.totalViews ?? 0,
      uniqueViewers: views.get(id)?.uniqueViewers ?? 0,
    };
  }

  async recordView(id: string, userId: string) {
    const ebook = await prisma.eBook.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!ebook) throw new NotFoundError('E-Book');
    if (ebook.status !== 'AVAILABLE') throw new BadRequestError('This e-book is not currently available');
    await prisma.eBookView.create({ data: { ebookId: id, userId } });
    const summary = await this.getViewSummaries([id]);
    return summary.get(id)!;
  }

  async getViewLogs(id: string) {
    const ebook = await prisma.eBook.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!ebook) throw new NotFoundError('E-Book');
    const [summary, recentActivity] = await Promise.all([
      this.getViewSummaries([id]),
      prisma.eBookView.findMany({
        where: { ebookId: id },
        orderBy: [{ viewedAt: 'desc' }, { id: 'desc' }],
        take: 3,
        select: {
          viewedAt: true,
          user: { select: { id: true, firstName: true, lastName: true, libraryId: true } },
        },
      }),
    ]);
    return {
      ...(summary.get(id) ?? { totalViews: 0, uniqueViewers: 0 }),
      recentActivity,
    };
  }

  /**
   * Create a new e-book
   */
  async createEBook(data: {
    isbn: string;
    title: string;
    author: string;
    publisher?: string;
    publishYear?: number;
    edition?: string;
    categoryId?: string;
    mainCategory?: string;
    classificationNumber?: string;
    description?: string;
    coverImage?: string;
    language?: string;
    fileUrl: string;
    fileSize?: number;
    format?: string;
  }) {
    // Check for duplicate ISBN
    const existing = await prisma.eBook.findFirst({
      where: { isbn: data.isbn },
    });
    if (existing) {
      throw new ConflictError('An e-book with this ISBN already exists');
    }

    const ebook = await prisma.eBook.create({
      data: {
        isbn: data.isbn,
        title: data.title,
        author: data.author,
        publisher: data.publisher || null,
        publishYear: data.publishYear ? Number(data.publishYear) : null,
        edition: data.edition || null,
        categoryId: data.categoryId,
        mainCategory: data.mainCategory || null,
        classificationNumber: data.classificationNumber ? normalizeClassificationNumber(data.classificationNumber) : null,
        description: data.description || null,
        coverImage: data.coverImage || null,
        language: data.language || 'English',
        fileUrl: data.fileUrl,
        fileSize: data.fileSize ? Number(data.fileSize) : null,
        format: (data.format as any) || 'PDF',
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
    });

    return ebook;
  }

  /**
   * Update an e-book
   */
  async updateEBook(
    id: string,
    input: Partial<{
      isbn: string;
      title: string;
      author: string;
      publisher: string;
      publishYear: number;
      edition: string;
      categoryId: string;
      mainCategory?: string;
      classificationNumber?: string;
      description: string;
      coverImage: string;
      language: string;
      fileUrl: string;
      fileSize: number;
      format: string;
      status: 'AVAILABLE' | 'BORROWED' | 'RESERVED' | 'MAINTENANCE' | 'LOST';
    }>
  ) {
    const ebook = await prisma.eBook.findUnique({ where: { id } });
    if (!ebook) throw new NotFoundError('E-Book');

    // If ISBN is being changed, check uniqueness
    if (input.isbn && input.isbn !== ebook.isbn) {
      const duplicate = await prisma.eBook.findFirst({
        where: { isbn: input.isbn, id: { not: id } },
      });
      if (duplicate) {
        throw new ConflictError('Another e-book with this ISBN already exists');
      }
    }

    const updated = await prisma.eBook.update({
      where: { id },
      data: {
        ...input,
        ...(input.publishYear !== undefined && { publishYear: Number(input.publishYear) }),
        ...(input.fileSize !== undefined && { fileSize: Number(input.fileSize) }),
        ...(input.classificationNumber !== undefined && {
          classificationNumber: normalizeClassificationNumber(input.classificationNumber),
        }),
      } as any,
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
    });

    return updated;
  }

  /**
   * Delete an e-book
   */
  async deleteEBook(id: string) {
    const ebook = await prisma.eBook.findUnique({ where: { id } });
    if (!ebook) throw new NotFoundError('E-Book');

    const archivedAt = new Date();
    await prisma.eBook.update({ where: { id }, data: { deletedAt: archivedAt, archivedAt } });
  }

  async listArchivedEBooks() {
    return prisma.eBook.findMany({
      where: { deletedAt: { not: null } },
      include: { category: true },
      orderBy: [{ archivedAt: 'desc' }, { deletedAt: 'desc' }],
    });
  }

  async restoreEBook(id: string) {
    const ebook = await prisma.eBook.findUnique({ where: { id } });
    if (!ebook) throw new NotFoundError('E-Book');
    return prisma.eBook.update({ where: { id }, data: { deletedAt: null, archivedAt: null } });
  }
}

export const ebookService = new EBookService();
