// ============================================================
// Book & Category Service
// ============================================================

import { Prisma, BookStatus } from '@prisma/client';
import { prisma } from '../config';
import { NotFoundError, ConflictError } from '../utils/errors';
import { getPaginationParams, buildPaginationMeta } from '../utils/pagination';
import { CreateBookInput, UpdateBookInput, CreateCategoryInput } from '../validators';
import { DEWEY_SECOND_SUMMARY, normalizeClassificationNumber } from '../constants/categories';

export class BookService {
  // ============================================================
  // Physical Books
  // ============================================================

  /**
   * List all books with pagination, search, and filtering
   */
  async listBooks(query: Record<string, unknown>) {
    const { page, limit, skip, take } = getPaginationParams(query);

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

    // Filter by category
    if (query.categoryId) {
      where.categoryId = query.categoryId as string;
    } else if (query.categoryMain) {
      where.category = { slug: { startsWith: `dewey-${String(query.categoryMain).slice(0, 1)}` } };
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
        orderBy: { createdAt: 'desc' },
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
  async createBook(data: CreateBookInput) {
    const existing = await prisma.book.findUnique({
      where: { accessionNo: data.accessionNo },
    });
    if (existing) throw new ConflictError('Book with this accession number already exists');

    const book = await prisma.book.create({
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
        description: data.description || null,
        coverImage: data.coverImage || null,
        language: data.language || 'English',
        shelf: data.shelf || null,
        row: data.row || null,
        copies: Number(data.copies) || 1,
        availableCopies: Number(data.availableCopies) || 1,
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
    });

    return book;
  }

  /**
   * Update a book
   */
  async updateBook(id: string, input: UpdateBookInput) {
    const book = await prisma.book.findUnique({ where: { id } });
    if (!book) throw new NotFoundError('Book');

    const updated = await prisma.book.update({
      where: { id },
      data: {
        ...input,
        ...(input.publishYear !== undefined && { publishYear: Number(input.publishYear) }),
        ...(input.pages !== undefined && { pages: Number(input.pages) }),
        ...(input.copies !== undefined && { copies: Number(input.copies) }),
        ...(input.availableCopies !== undefined && { availableCopies: Number(input.availableCopies) }),
        ...(input.classificationNumber !== undefined && {
          classificationNumber: normalizeClassificationNumber(input.classificationNumber),
        }),
        ...(input.copies !== undefined && {
          availableCopies: Number(input.copies) - (book.copies - book.availableCopies),
        }),
        ...(input.availableCopies !== undefined && { availableCopies: Number(input.availableCopies) }),
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
    });

    return updated;
  }

  /**
   * Delete a book
   */
  async deleteBook(id: string) {
    const book = await prisma.book.findUnique({ where: { id } });
    if (!book) throw new NotFoundError('Book');

    // Check for active transactions
    const activeTx = await prisma.borrowTransaction.count({
      where: { bookId: id, status: 'ACTIVE' },
    });
    if (activeTx > 0) {
      throw new ConflictError('Cannot delete book with active borrow transactions');
    }

    await prisma.book.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async listArchivedBooks() {
    return prisma.book.findMany({ where: { deletedAt: { not: null } }, include: { category: true }, orderBy: { deletedAt: 'desc' } });
  }

  async restoreBook(id: string) {
    const book = await prisma.book.findUnique({ where: { id } });
    if (!book) throw new NotFoundError('Book');
    return prisma.book.update({ where: { id }, data: { deletedAt: null } });
  }

  // ============================================================
  // Categories
  // ============================================================

  /**
   * List all categories (tree structure)
   */
  async listCategories() {
    // Keep the category API usable even when a deployment has not run the latest seed.
    await prisma.$transaction(
      DEWEY_SECOND_SUMMARY.map(([code, name]) => prisma.category.upsert({
        where: { slug: `dewey-${code}` },
        update: { name: `${code} ${name}`, description: `Dewey Decimal 2nd Summary ${code}` },
        create: {
          id: `dewey-${code}`,
          name: `${code} ${name}`,
          slug: `dewey-${code}`,
          description: `Dewey Decimal 2nd Summary ${code}`,
        },
      }))
    );

    const categories = await prisma.category.findMany({
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

