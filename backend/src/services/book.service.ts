// ============================================================
// Book & Category Service
// ============================================================

import { Prisma, BookStatus } from '@prisma/client';
import { prisma } from '../config';
import { NotFoundError, ConflictError, BadRequestError } from '../utils/errors';
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination';
import { CreateBookInput, UpdateBookInput, CreateCategoryInput } from '../validators';
import { DEWEY_SECOND_SUMMARY, normalizeClassificationNumber } from '../constants/categories';
import { getSortParams } from '../utils/sorting';
import { recordActivity } from './activity-log.service';

export class BookService {
  // ============================================================
  // Physical Books
  // ============================================================

  /**
   * List all books with pagination, search, and filtering
   */
  async listBooks(query: Record<string, unknown>) {
    const { page, limit, skip, take } = getPaginationParams(query);
    const { sort, order } = getSortParams(query, ['title', 'author', 'classification', 'createdAt', 'availability'] as const, 'title', 'asc');

    const where: Prisma.BookWhereInput = { deletedAt: null };

    // Search by title, author, ISBN, accession number, or Dewey classification
    if (query.search) {
      const search = query.search as string;
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { author: { contains: search, mode: 'insensitive' } },
        { isbn: { contains: search } },
        { accessionNo: { contains: search } },
        { classificationNumber: { contains: search } },
      ];
    }

    // Filter by status
    if (query.status) {
      where.status = query.status as BookStatus;
    }

    // Filter by category. Expand a selected parent to its descendants before
    // querying books so the indexed categoryId column does the actual filtering.
    if (query.categoryId) {
      const categoryIds = await this.getCategoryAndDescendantIds(String(query.categoryId));
      where.categoryId = { in: categoryIds };
    } else if (query.categoryMain) {
      const mainCode = String(query.categoryMain).padStart(3, '0').slice(0, 1);
      const mainCategories = await prisma.category.findMany({
        where: { slug: { startsWith: `dewey-${mainCode}` } },
        select: { id: true },
      });
      where.categoryId = { in: mainCategories.map((category) => category.id) };
    }

    if (query.classificationNumber) {
      where.classificationNumber = { contains: query.classificationNumber as string };
    }

    const [books, total] = await Promise.all([
      prisma.book.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
        orderBy: sort === 'availability'
          ? [{ availableCopies: order === 'asc' ? 'desc' : 'asc' }, { title: 'asc' }, { id: 'asc' }]
          : [{ [sort === 'classification' ? 'classificationNumber' : sort]: order }, { id: 'asc' }],
        skip,
        take,
      }),
      prisma.book.count({ where }),
    ]);

    return {
      books,
      meta: buildPaginationMeta(total, { page, limit, skip, take }),
    };
  }

  private async getCategoryAndDescendantIds(categoryId: string): Promise<string[]> {
    const ids = [categoryId];
    let parentIds = [categoryId];

    while (parentIds.length > 0) {
      const children = await prisma.category.findMany({
        where: { parentId: { in: parentIds } },
        select: { id: true },
      });
      const childIds = children.map((child) => child.id).filter((id) => !ids.includes(id));
      ids.push(...childIds);
      parentIds = childIds;
    }

    return ids;
  }

  /**
   * Get book by ID
   */
  async getBookById(id: string) {
    const book = await prisma.book.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        borrowTransactions: {
          where: { status: 'ACTIVE' },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, libraryId: true } },
          },
        },
        reservations: {
          where: { status: 'ACTIVE' },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, libraryId: true } },
          },
          orderBy: { queuePosition: 'asc' },
        },
      },
    });

    if (!book) throw new NotFoundError('Book');
    return book;
  }

  /**
   * Create a new book
   */
  async createBook(
    data: CreateBookInput,
    actor: { userId: string; ipAddress?: string; userAgent?: string },
  ) {
    const existing = await prisma.book.findUnique({
      where: { accessionNo: data.accessionNo },
    });
    if (existing) throw new ConflictError('Book with this accession number already exists');

    const copies = Number(data.copies) || 1;
    const availableCopies = data.availableCopies == null
      ? copies
      : Number(data.availableCopies);
    if (!Number.isInteger(availableCopies) || availableCopies < 0 || availableCopies > copies) {
      throw new BadRequestError('Available copies must be between 0 and total copies');
    }

    const book = await prisma.$transaction(async (tx) => {
      const createdBook = await tx.book.create({
        data: {
          isbn: data.isbn,
          accessionNo: data.accessionNo,
          title: data.title,
          author: data.author,
          publisher: data.publisher || null,
          publishYear: data.publishYear ? Number(data.publishYear) : null,
          edition: data.edition || null,
          pages: data.pages ? Number(data.pages) : null,
          categoryId: data.categoryId,
          classificationNumber: normalizeClassificationNumber(data.classificationNumber),
          replacementValue: new Prisma.Decimal(Number(data.replacementValue ?? 0)),
          description: data.description || null,
          coverImage: data.coverImage || null,
          language: data.language || 'English',
          shelf: data.shelf || null,
          row: data.row || null,
          copies,
          availableCopies,
        },
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
      });
      const user = await tx.user.findUnique({
        where: { id: actor.userId },
        select: { firstName: true, lastName: true },
      });
      const performedByName = user
        ? `${user.firstName} ${user.lastName}`.trim()
        : undefined;

      await recordActivity({
        userId: actor.userId,
        action: 'ADD_BOOK',
        description: `Added book "${createdBook.title}"`,
        entity: 'Book',
        entityId: createdBook.id,
        ipAddress: actor.ipAddress,
        details: {
          bookId: createdBook.id,
          bookTitle: createdBook.title,
          ...(performedByName ? { performedByName } : {}),
          ...(actor.userAgent ? { userAgent: actor.userAgent } : {}),
        },
      }, tx);

      return createdBook;
    });

    return book;
  }

  /**
   * Update a book
   */
  async updateBook(
    id: string,
    input: UpdateBookInput,
    actor: { userId: string; ipAddress?: string; userAgent?: string },
  ) {
    const book = await prisma.book.findUnique({ where: { id } });
    if (!book) throw new NotFoundError('Book');

    const updated = await prisma.$transaction(async (tx) => {
      const updatedBook = await tx.book.update({
        where: { id },
        data: {
          ...input,
          ...(input.publishYear !== undefined && { publishYear: Number(input.publishYear) }),
          ...(input.pages !== undefined && { pages: Number(input.pages) }),
          ...(input.copies !== undefined && { copies: Number(input.copies) }),
          ...(input.availableCopies !== undefined && { availableCopies: Number(input.availableCopies) }),
          ...(input.replacementValue !== undefined && { replacementValue: new Prisma.Decimal(Number(input.replacementValue)) }),
          ...(input.classificationNumber !== undefined && {
            classificationNumber: normalizeClassificationNumber(input.classificationNumber),
          }),
          ...(input.copies !== undefined && {
            availableCopies: Number(input.copies) - (book.copies - book.availableCopies),
          }),
        },
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
      });
      await recordActivity({
        userId: actor.userId,
        action: 'UPDATE_BOOK',
        description: `Edited book "${updatedBook.title}"`,
        entity: 'Book',
        entityId: updatedBook.id,
        ipAddress: actor.ipAddress,
        details: {
          bookTitle: updatedBook.title,
          accessionNo: updatedBook.accessionNo,
          ...(actor.userAgent ? { userAgent: actor.userAgent } : {}),
        },
      }, tx);
      return updatedBook;
    });

    return updated;
  }

  /**
   * Delete a book
   */
  async deleteBook(
    id: string,
    actor: { userId: string; ipAddress?: string; userAgent?: string },
  ) {
    const book = await prisma.book.findUnique({ where: { id } });
    if (!book) throw new NotFoundError('Book');

    // Check for active transactions
    const activeTx = await prisma.borrowTransaction.count({
      where: { bookId: id, status: 'ACTIVE' },
    });
    if (activeTx > 0) {
      throw new ConflictError('Cannot delete book with active borrow transactions');
    }

    const archivedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.book.update({ where: { id }, data: { deletedAt: archivedAt, archivedAt } });
      await recordActivity({
        userId: actor.userId,
        action: 'DELETE_BOOK',
        description: `Deleted book "${book.title}"`,
        entity: 'Book',
        entityId: book.id,
        ipAddress: actor.ipAddress,
        details: {
          bookId: book.id,
          bookTitle: book.title,
          ...(actor.userAgent ? { userAgent: actor.userAgent } : {}),
        },
      }, tx);
    });
  }

  async listArchivedBooks() {
    return prisma.book.findMany({
      where: { deletedAt: { not: null } },
      include: { category: true },
      orderBy: [{ archivedAt: 'desc' }, { deletedAt: 'desc' }],
    });
  }

  async restoreBook(id: string) {
    const book = await prisma.book.findUnique({ where: { id } });
    if (!book) throw new NotFoundError('Book');
    return prisma.book.update({ where: { id }, data: { deletedAt: null, archivedAt: null } });
  }

  // ============================================================
  // Categories
  // ============================================================

  /**
   * List all categories (tree structure)
   */
  async listCategories() {
    // Keep the category API usable even when a deployment has not run the latest seed.
    const categories = await prisma.$transaction(
      DEWEY_SECOND_SUMMARY.map(([code, name]) => prisma.category.upsert({
        where: { slug: `dewey-${code}` },
        update: { name: `${code} ${name}`, description: `Dewey Decimal 2nd Summary ${code}`, parentId: null },
        create: {
          id: `dewey-${code}`,
          name: `${code} ${name}`,
          slug: `dewey-${code}`,
          description: `Dewey Decimal 2nd Summary ${code}`,
        },
      }))
    );

    const categoriesByCode = new Map(categories.map((category) => [category.slug.slice(-3), category]));
    const childrenByParent = new Map<string, string[]>();
    for (const category of categories) {
      const code = category.slug.slice(-3);
      if (code.endsWith('00')) continue;
      const parentCode = `${code[0]}00`;
      const parent = categoriesByCode.get(parentCode);
      if (!parent || category.parentId === parent.id) continue;
      const childIds = childrenByParent.get(parent.id) || [];
      childIds.push(category.id);
      childrenByParent.set(parent.id, childIds);
    }
    if (childrenByParent.size > 0) {
      await prisma.$transaction(
        Array.from(childrenByParent, ([parentId, ids]) => prisma.category.updateMany({
          where: { id: { in: ids } },
          data: { parentId },
        }))
      );
    }

    return prisma.category.findMany({
      where: { slug: { startsWith: 'dewey-' } },
      include: {
        children: { include: { _count: { select: { books: true, eBooks: true } } } },
        _count: { select: { books: true, eBooks: true } },
      },
      orderBy: { name: 'asc' },
    });
    return categories;
  }

  /**
   * Create a category
   */
  async createCategory(input: CreateCategoryInput) {
    const slug = input.slug || input.name.toLowerCase().replace(/\s+/g, '-');

    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) throw new ConflictError('Category with this slug already exists');

    const category = await prisma.category.create({
      data: { ...input, slug },
      include: { parent: { select: { id: true, name: true } } },
    });

    return category;
  }

  /**
   * Get category by ID
   */
  async getCategoryById(id: string) {
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: { select: { id: true, name: true, slug: true } },
        _count: { select: { books: true, eBooks: true } },
      },
    });

    if (!category) throw new NotFoundError('Category');
    return category;
  }

  /**
   * Update a category
   */
  async updateCategory(id: string, input: Partial<CreateCategoryInput>) {
    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundError('Category');

    const data: any = { ...input };
    if (input.name && !input.slug) {
      data.slug = input.name.toLowerCase().replace(/\s+/g, '-');
    }

    const updated = await prisma.category.update({
      where: { id },
      data,
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { books: true, eBooks: true } },
      },
    });

    return updated;
  }

  /**
   * Delete a category
   */
  async deleteCategory(id: string) {
    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundError('Category');

    const bookCount = await prisma.book.count({ where: { categoryId: id } });
    if (bookCount > 0) {
      throw new ConflictError('Cannot delete category with associated books');
    }

    await prisma.category.delete({ where: { id } });
  }
}

export const bookService = new BookService();
