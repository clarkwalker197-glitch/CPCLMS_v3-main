// ============================================================
// Analytics & Dashboard Statistics Service
// ============================================================

import { prisma } from '../config';
import { DEPARTMENTS } from '../constants/departments';

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
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

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
      prisma.book.count(),
      prisma.eBook.count(),
      prisma.user.count(),
      prisma.borrowTransaction.count(),
      prisma.borrowTransaction.count({ where: { status: 'ACTIVE' } }),
      prisma.borrowTransaction.count({ where: { status: 'OVERDUE' } }),
      prisma.borrowRequest.count({ where: { status: 'PENDING' } }),
      prisma.reservation.count({ where: { status: 'ACTIVE' } }),
      prisma.book.count({ where: { status: 'AVAILABLE' } }),
      prisma.book.count({ where: { status: 'BORROWED' } }),
      prisma.book.count({ where: { status: 'MAINTENANCE' } }),
      prisma.book.count({ where: { status: 'LOST' } }),
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.user.count({ where: { role: 'FACULTY' } }),
      prisma.user.count({ where: { role: 'LIBRARIAN' } }),
      prisma.borrowTransaction.count({
        where: { borrowDate: { gte: todayStart, lt: todayEnd } },
      }),
      prisma.borrowTransaction.count({
        where: { returnDate: { gte: todayStart, lt: todayEnd } },
      }),
      prisma.user.count({
        where: { createdAt: { gte: todayStart, lt: todayEnd } },
      }),
      // Top 10 most borrowed books
      prisma.borrowTransaction.groupBy({
        by: ['bookId'],
        _count: { bookId: true },
        orderBy: { _count: { bookId: 'desc' } },
        take: 10,
      }),
      // Users with overdue books
      prisma.borrowTransaction.findMany({
        where: { status: 'OVERDUE' },
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
          where: { userId, status: 'OVERDUE', finePaid: false },
          select: { fineAmount: true },
        }),
      ]);

    const myFines = overdueTxns.reduce(
      (sum, txn) => sum + (txn.fineAmount || 0),
      0
    );

    return {
      myBorrowed,
      myPendingRequests,
      myReservations,
      myFines,
    };
  }

  /**
   * Get monthly borrow trends for charts
   */
  async getMonthlyTrends(months: number = 6) {
    const since = new Date();
    since.setMonth(since.getMonth() - months);

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
      const since = new Date();
      if (selectedRange === '30d') since.setDate(since.getDate() - 30);
      if (selectedRange === '90d') since.setDate(since.getDate() - 90);
      if (selectedRange === 'semester') {
        const semesterStartMonth = since.getMonth() < 6 ? 0 : 6;
        since.setMonth(semesterStartMonth, 1);
      }
      since.setHours(0, 0, 0, 0);
      where.borrowDate = { gte: since };
    }

    const transactions = await prisma.borrowTransaction.findMany({
      where,
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
  async getDepartmentDistribution() {
    const departments = await prisma.borrowTransaction.groupBy({
      by: ['userId'],
      _count: { userId: true },
      orderBy: { _count: { userId: 'desc' } },
    });

    // Get user details to find departments
    const users = await prisma.user.findMany({
      where: { department: { not: null } },
      select: { id: true, department: true },
    });

    const userDeptMap = new Map(users.map((u: any) => [u.id, u.department || 'Unknown']));

    // Group borrows by department
    const deptMap = new Map(DEPARTMENTS.map((department) => [department.code, 0]));
    for (const dept of departments) {
      const department = userDeptMap.get(dept.userId) || 'Unknown';
      if (deptMap.has(department)) {
        deptMap.set(department, (deptMap.get(department) || 0) + dept._count.userId);
      }
    }

    // Convert to array and sort by borrow count (descending)
    const result = DEPARTMENTS.map((department) => ({
      code: department.code,
      name: `${department.name} (${department.code})`,
      value: deptMap.get(department.code) || 0,
    }));

    return result;
  }
}

export const analyticsService = new AnalyticsService();

