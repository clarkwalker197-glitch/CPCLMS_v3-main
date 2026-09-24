// ============================================================
// Analytics & Dashboard Statistics Service
// ============================================================

import { prisma } from '../config';
import { DEPARTMENTS } from '../constants/departments';
import { transactionService } from './transaction.service';

type AnalyticsRange = '7d' | '30d' | '90d' | 'semester' | 'all';

function getRangeStart(range: string = 'all'): Date | undefined {
  const selectedRange = range as AnalyticsRange;
  if (selectedRange === 'all') return undefined;

  const now = new Date();
  const start = new Date(now);
  if (selectedRange === '7d') start.setDate(start.getDate() - 7);
  else if (selectedRange === '30d') start.setDate(start.getDate() - 30);
  else if (selectedRange === '90d') start.setDate(start.getDate() - 90);
  else if (selectedRange === 'semester') start.setMonth(now.getMonth() < 6 ? 0 : 6, 1);
  else return undefined;
  start.setHours(0, 0, 0, 0);
  return start;
}

function normalizeRange(range?: string): AnalyticsRange {
  return ['7d', '30d', '90d', 'semester', 'all'].includes(range || '')
    ? range as AnalyticsRange
    : 'all';
}

export interface DashboardStats {
  overview: {
    totalBooks: number;
    totalEBooks: number;
    totalUsers: number;
    totalTransactions: number;
    activeBorrows: number;
    overdueBooks: number;
    pendingRequests: number;
    activeReservations: number;
  };
  bookStatus: {
    available: number;
    borrowed: number;
    maintenance: number;
    lost: number;
  };
  userRoles: {
    students: number;
    faculty: number;
    librarians: number;
  };
  recentActivity: {
    todayBorrows: number;
    todayReturns: number;
    todayRegistrations: number;
  };
  topBooks: Array<{
    id: string;
    title: string;
    author: string;
    borrowCount: number;
    accessionNo: string;
  }>;
  overdueByUser: Array<{
    userId: string;
    firstName: string;
    lastName: string;
    libraryId: string;
    overdueCount: number;
    totalFine: number;
  }>;
}

export class AnalyticsService {
  async getDashboardStats(): Promise<DashboardStats> {
    await transactionService.synchronizeOverdueTransactions();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const activeBookWhere = { archivedAt: null, deletedAt: null };
    const activeUserWhere = { archivedAt: null, isActive: true };

    const [
      totalBooks,
      totalEBooks,
      totalUsers,
      totalTransactions,
      activeBorrows,
      overdueBooks,
      pendingRequests,
      activeReservations,
      availableBooks,
      borrowedBooks,
      maintenanceBooks,
      lostBooks,
      students,
      faculty,
      librarians,
      todayBorrows,
      todayReturns,
      todayRegistrations,
      topBooksRaw,
      overdueUsers,
    ] = await Promise.all([
      prisma.book.count({ where: activeBookWhere }),
      prisma.eBook.count({ where: activeBookWhere }),
      prisma.user.count({ where: activeUserWhere }),
      prisma.borrowTransaction.count({
        where: {
          user: activeUserWhere,
          book: activeBookWhere,
        },
      }),
      prisma.borrowTransaction.count({
        where: {
          status: 'ACTIVE',
          user: activeUserWhere,
          book: activeBookWhere,
        },
      }),
      prisma.borrowTransaction.count({
        where: {
          status: 'OVERDUE',
          user: activeUserWhere,
          book: activeBookWhere,
        },
      }),
      prisma.borrowRequest.count({ where: { status: 'PENDING', user: activeUserWhere } }),
      prisma.reservation.count({ where: { status: 'ACTIVE', user: activeUserWhere } }),
      prisma.book.count({ where: { ...activeBookWhere, status: 'AVAILABLE' } }),
      prisma.book.count({ where: { ...activeBookWhere, status: 'BORROWED' } }),
      prisma.book.count({ where: { ...activeBookWhere, status: 'MAINTENANCE' } }),
      prisma.book.count({ where: { ...activeBookWhere, status: 'LOST' } }),
      prisma.user.count({ where: { ...activeUserWhere, role: 'STUDENT' } }),
      prisma.user.count({ where: { ...activeUserWhere, role: 'FACULTY' } }),
      prisma.user.count({ where: { ...activeUserWhere, role: 'LIBRARIAN' } }),
      prisma.borrowTransaction.count({
        where: {
          borrowDate: { gte: todayStart, lt: todayEnd },
          user: activeUserWhere,
          book: activeBookWhere,
        },
      }),
      prisma.borrowTransaction.count({
        where: {
          returnDate: { gte: todayStart, lt: todayEnd },
          user: activeUserWhere,
          book: activeBookWhere,
        },
      }),
      prisma.user.count({
        where: {
          ...activeUserWhere,
          createdAt: { gte: todayStart, lt: todayEnd },
        },
      }),
      // Top 10 most borrowed books
      prisma.borrowTransaction.groupBy({
        by: ['bookId'],
        where: {
          user: activeUserWhere,
          book: activeBookWhere,
        },
        _count: { bookId: true },
        orderBy: { _count: { bookId: 'desc' } },
        take: 10,
      }),
      // Users with overdue books
      prisma.borrowTransaction.findMany({
        where: {
          status: 'OVERDUE',
          user: activeUserWhere,
          book: activeBookWhere,
        },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, libraryId: true },
          },
        },
      }),
    ]);

    // Resolve top book details
interface TopBookRaw { bookId: string; _count: { bookId: number } }
    interface BookInfo { id: string; title: string; author: string; accessionNo: string }
    const bookIds = topBooksRaw.map((b: TopBookRaw) => b.bookId);
    const books: BookInfo[] = await prisma.book.findMany({
      where: { id: { in: bookIds } },
      select: { id: true, title: true, author: true, accessionNo: true },
    });
    const bookMap = new Map<string, BookInfo>(books.map((b: BookInfo) => [b.id, b]));
    const topBooks = topBooksRaw.map((b: TopBookRaw) => {
      const book = bookMap.get(b.bookId);
      return {
        id: b.bookId,
        title: book?.title || 'Unknown',
        author: book?.author || 'Unknown',
        borrowCount: b._count.bookId,
        accessionNo: book?.accessionNo || 'N/A',
      };
    });

    // Aggregate overdue by user
    interface OverdueTxn { userId: string; fineAmount: number | null; user: { id: string; firstName: string; lastName: string; libraryId: string } }
    const overdueMap = new Map<string, { count: number; fine: number }>();
    for (const txn of overdueUsers as OverdueTxn[]) {
      const existing = overdueMap.get(txn.userId) || { count: 0, fine: 0 };
      existing.count++;
      existing.fine += txn.fineAmount || 0;
      overdueMap.set(txn.userId, existing);
    }
    const overdueByUser = Array.from(overdueMap.entries()).map(([userId, data]) => {
      const txn = (overdueUsers as OverdueTxn[]).find((t: OverdueTxn) => t.userId === userId);
      return {
        userId,
        firstName: txn?.user.firstName || '',
        lastName: txn?.user.lastName || '',
        libraryId: txn?.user.libraryId || '',
        overdueCount: data.count,
        totalFine: data.fine,
      };
    });

    return {
      overview: {
        totalBooks,
        totalEBooks,
        totalUsers,
        totalTransactions,
        activeBorrows,
        overdueBooks,
        pendingRequests,
        activeReservations,
      },
      bookStatus: {
        available: availableBooks,
        borrowed: borrowedBooks,
        maintenance: maintenanceBooks,
        lost: lostBooks,
      },
      userRoles: {
        students,
        faculty,
        librarians,
      },
      recentActivity: {
        todayBorrows,
        todayReturns,
        todayRegistrations,
      },
      topBooks,
      overdueByUser,
    };
  }

/**
   * Get dashboard statistics for a specific member (Student/Faculty)
   * - Currently Borrowed: active + overdue (not yet returned)
   * - Pending Requests: borrow requests with PENDING status
   * - Active Reservations: reservations with ACTIVE status
   * - Overdue Fines: total unpaid fines (in peso)
   */
  async getMyDashboardStats(userId: string) {
    await transactionService.synchronizeOverdueTransactions();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueSoonEnd = new Date(todayStart);
    dueSoonEnd.setDate(dueSoonEnd.getDate() + 4);
    const [myBorrowed, myPendingRequests, myReservations, overdueTxns] =
      await Promise.all([
        prisma.borrowTransaction.count({
          where: { userId, status: { in: ['ACTIVE', 'OVERDUE'] } },
        }),
        prisma.borrowRequest.count({
          where: { userId, status: 'PENDING' },
        }),
        prisma.reservation.count({
          where: { userId, status: 'ACTIVE' },
        }),
        prisma.borrowTransaction.findMany({
          where: { userId, fineAmount: { gt: 0 }, finePaid: false },
          select: { fineAmount: true },
        }),
      ]);

    const dueSoon = await prisma.borrowTransaction.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        dueDate: { gte: todayStart, lt: dueSoonEnd },
        returnDate: null,
      },
      select: {
        id: true,
        dueDate: true,
        book: { select: { id: true, title: true, author: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const myFines = overdueTxns.reduce(
      (sum, txn) => sum + (txn.fineAmount || 0),
      0
    );

    return {
      myBorrowed,
      myPendingRequests,
      myReservations,
      myFines,
      dueSoon,
    };
  }

  /**
   * Get monthly borrow trends for charts
   */
  async getMonthlyTrends(months: number = 6, range: string = 'all') {
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    const rangeStart = getRangeStart(normalizeRange(range));
    if (rangeStart && rangeStart > since) since.setTime(rangeStart.getTime());

    const transactions = await prisma.borrowTransaction.findMany({
      where: { borrowDate: { gte: since } },
      select: { borrowDate: true, status: true },
      orderBy: { borrowDate: 'asc' },
    });

    // Group by month
    const monthlyMap = new Map<string, { borrows: number; returns: number; overdues: number }>();
    for (const txn of transactions) {
      const key = `${txn.borrowDate.getFullYear()}-${String(txn.borrowDate.getMonth() + 1).padStart(2, '0')}`;
      const entry = monthlyMap.get(key) || { borrows: 0, returns: 0, overdues: 0 };
      entry.borrows++;
      if (txn.status === 'RETURNED') entry.returns++;
      if (txn.status === 'OVERDUE') entry.overdues++;
      monthlyMap.set(key, entry);
    }

    return Array.from(monthlyMap.entries()).map(([month, data]) => ({
      month,
      ...data,
    }));
  }

  /**
   * Get the most borrowed Dewey categories.
   */
  async getMostBorrowedCategories(range: string = 'all', requestedLimit: number = 10) {
    const validRanges = new Set(['all', '30d', '90d', 'semester']);
    const selectedRange = validRanges.has(range) ? range : 'all';
    const limit = Math.min(50, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 10));
    const mainCategories: Record<string, { name: string; slug: string }> = {
      '000': { name: 'Generalities', slug: 'dewey-000' },
      '100': { name: 'Philosophy & psychology', slug: 'dewey-100' },
      '200': { name: 'Religion', slug: 'dewey-200' },
      '300': { name: 'Social sciences', slug: 'dewey-300' },
      '400': { name: 'Language', slug: 'dewey-400' },
      '500': { name: 'Science', slug: 'dewey-500' },
      '600': { name: 'Technology', slug: 'dewey-600' },
      '700': { name: 'Arts & recreation', slug: 'dewey-700' },
      '800': { name: 'Literature', slug: 'dewey-800' },
      '900': { name: 'History & geography', slug: 'dewey-900' },
    };
    const where: { borrowDate?: { gte: Date } } = {};

    if (selectedRange !== 'all') {
      where.borrowDate = { gte: getRangeStart(selectedRange)! };
    }

    const transactions = await prisma.borrowTransaction.findMany({
      where: {
        ...where,
        user: { archivedAt: null, isActive: true },
        book: { archivedAt: null, deletedAt: null },
      },
      select: {
        book: {
          select: {
            category: { select: { name: true, slug: true } },
          },
        },
      },
    });
    const counts = new Map<string, number>();
    for (const transaction of transactions) {
      const category = transaction.book.category;
      if (!category) continue;
      const categoryCode = category.slug.match(/^dewey-(\d{3})$/)?.[1];
      if (!categoryCode) continue;
      const mainCode = `${categoryCode[0]}00`;
      if (!mainCategories[mainCode]) continue;
      counts.set(mainCode, (counts.get(mainCode) || 0) + 1);
    }

    return {
      range: selectedRange,
      data: Array.from(counts.entries())
        .map(([categoryCode, borrowCount]) => ({
          categoryCode,
          name: mainCategories[categoryCode].name,
          slug: mainCategories[categoryCode].slug,
          borrowCount,
        }))
        .sort((a, b) => Number(a.categoryCode) - Number(b.categoryCode))
        .slice(0, limit),
    };
  }

  /**
   * Get department-wise borrowing distribution
   */
  async getDepartmentDistribution(range: string = 'all') {
    const rangeStart = getRangeStart(normalizeRange(range));
    const departments = await prisma.borrowTransaction.findMany({
      where: {
        ...(rangeStart ? { borrowDate: { gte: rangeStart } } : {}),
        user: { archivedAt: null, isActive: true },
        book: { archivedAt: null, deletedAt: null },
      },
      select: { userId: true },
    });

    // Get user details to find departments
    const users = await prisma.user.findMany({
      where: { department: { not: null }, archivedAt: null, isActive: true },
      select: { id: true, department: true },
    });

    const userDeptMap = new Map(users.map((u: any) => [u.id, u.department || 'Unknown']));

    // Group borrows by department
    const deptMap = new Map(DEPARTMENTS.map((department) => [department.code, 0]));
    for (const dept of departments) {
      const department = userDeptMap.get(dept.userId) || 'Unknown';
      if (deptMap.has(department)) {
        deptMap.set(department, (deptMap.get(department) || 0) + 1);
      }
    }

    // Convert to array and sort by borrow count (descending)
    const result = DEPARTMENTS.map((department) => ({
      code: department.code,
      name: department.name,
      shortName: department.code,
      value: deptMap.get(department.code) || 0,
    })).sort((a, b) => (b.value || 0) - (a.value || 0));

    return result;
  }

  async getOverdueFinesSummary(range: string = 'all') {
    await transactionService.synchronizeOverdueTransactions();
    const rangeStart = getRangeStart(normalizeRange(range));
    const transactions = await prisma.borrowTransaction.findMany({
      where: {
        fineAmount: { gt: 0 },
        ...(rangeStart ? { borrowDate: { gte: rangeStart } } : {}),
      },
      select: { fineAmount: true, finePaid: true, borrowDate: true },
      orderBy: { borrowDate: 'asc' },
    });
    const monthly = new Map<string, { paid: number; unpaid: number }>();
    let paid = 0;
    let unpaid = 0;
    for (const transaction of transactions) {
      const amount = transaction.fineAmount || 0;
      if (transaction.finePaid) paid += amount;
      else unpaid += amount;
      const month = `${transaction.borrowDate.getFullYear()}-${String(transaction.borrowDate.getMonth() + 1).padStart(2, '0')}`;
      const entry = monthly.get(month) || { paid: 0, unpaid: 0 };
      entry[transaction.finePaid ? 'paid' : 'unpaid'] += amount;
      monthly.set(month, entry);
    }
    return {
      range: normalizeRange(range),
      paid,
      unpaid,
      total: paid + unpaid,
      monthly: Array.from(monthly.entries()).map(([month, values]) => ({ month, ...values })),
    };
  }

  async getTopBorrowedBooks(range: string = 'all', limit = 10) {
    const rangeStart = getRangeStart(normalizeRange(range));
    const grouped = await prisma.borrowTransaction.groupBy({
      by: ['bookId'],
      where: {
        ...(rangeStart ? { borrowDate: { gte: rangeStart } } : {}),
        user: { archivedAt: null, isActive: true },
        book: { archivedAt: null, deletedAt: null },
      },
      _count: { bookId: true },
      orderBy: { _count: { bookId: 'desc' } },
      take: Math.min(10, Math.max(1, limit)),
    });
    const books = await prisma.book.findMany({
      where: { id: { in: grouped.map((item) => item.bookId) } },
      select: { id: true, title: true, author: true },
    });
    const bookMap = new Map(books.map((book) => [book.id, book]));
    return grouped.map((item) => ({
      ...(bookMap.get(item.bookId) || { id: item.bookId, title: 'Unknown', author: 'Unknown' }),
      borrowCount: item._count.bookId,
    }));
  }

  async getReturnPerformance(range: string = 'all') {
    const rangeStart = getRangeStart(normalizeRange(range));
    const returned = await prisma.borrowTransaction.findMany({
      where: {
        status: 'RETURNED',
        ...(rangeStart ? { returnDate: { gte: rangeStart } } : {}),
      },
      select: { dueDate: true, returnDate: true },
    });
    const onTime = returned.filter((item) => item.returnDate && item.returnDate <= item.dueDate).length;
    const late = returned.length - onTime;
    return {
      totalReturned: returned.length,
      onTime,
      late,
      onTimeRate: returned.length ? (onTime / returned.length) * 100 : 0,
    };
  }

  async getRequestPipelineStats(range: string = 'all') {
    const rangeStart = getRangeStart(normalizeRange(range));
    const requests = await prisma.borrowRequest.findMany({
      where: rangeStart ? { requestDate: { gte: rangeStart } } : {},
      select: { status: true, requestDate: true, processedAt: true },
    });
    const approved = requests.filter((request) => request.status === 'APPROVED').length;
    const rejected = requests.filter((request) => request.status === 'REJECTED').length;
    const processed = requests.filter((request) => request.processedAt && ['APPROVED', 'REJECTED'].includes(request.status));
    const averageApprovalHours = processed.length
      ? processed.reduce((sum, request) => sum + (request.processedAt!.getTime() - request.requestDate.getTime()) / 3600000, 0) / processed.length
      : 0;
    return {
      pending: requests.filter((request) => request.status === 'PENDING').length,
      approved,
      rejected,
      approvalRate: approved + rejected ? (approved / (approved + rejected)) * 100 : 0,
      averageApprovalHours,
    };
  }

  async getInventoryHealth() {
    const books = await prisma.book.findMany({
      where: { archivedAt: null, deletedAt: null },
      select: {
        id: true, title: true, author: true, copies: true, availableCopies: true, status: true,
        borrowTransactions: { select: { id: true }, take: 1 },
      },
      orderBy: { availableCopies: 'asc' },
    });
    const lowStock = books.filter((book) => book.availableCopies <= 1);
    return {
      lowStockCount: lowStock.length,
      unavailableCount: books.filter((book) => book.availableCopies === 0).length,
      neverBorrowedCount: books.filter((book) => book.borrowTransactions.length === 0).length,
      lowStock: lowStock.slice(0, 20).map(({ borrowTransactions, ...book }) => book),
      neverBorrowed: books.filter((book) => book.borrowTransactions.length === 0).slice(0, 20).map(({ borrowTransactions, ...book }) => book),
    };
  }

  async getMemberEngagement(range: string = 'all') {
    const rangeStart = getRangeStart(normalizeRange(range));
    const grouped = await prisma.borrowTransaction.groupBy({
      by: ['userId'],
      where: rangeStart ? { borrowDate: { gte: rangeStart } } : {},
      _count: { userId: true },
      orderBy: { _count: { userId: 'desc' } },
      take: 10,
    });
    const users = await prisma.user.findMany({
      where: { id: { in: grouped.map((item) => item.userId) } },
      select: { id: true, firstName: true, lastName: true, department: true, role: true },
    });
    const userMap = new Map(users.map((user) => [user.id, user]));
    const activeMembers = await prisma.user.count({ where: { role: { in: ['STUDENT', 'FACULTY'] }, isActive: true, archivedAt: null } });
    const inactiveMembers = await prisma.user.count({ where: { role: { in: ['STUDENT', 'FACULTY'] }, OR: [{ isActive: false }, { archivedAt: { not: null } }] } });
    return {
      activeMembers,
      inactiveMembers,
      topBorrowers: grouped.map((item) => ({
        ...(userMap.get(item.userId) || { id: item.userId, firstName: 'Unknown', lastName: 'member', department: null, role: null }),
        borrowCount: item._count.userId,
      })),
    };
  }
}

export const analyticsService = new AnalyticsService();

