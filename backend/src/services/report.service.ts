// ============================================================
// Report Generation Service
// - PDF reports (pdf-lib)
// - Excel reports (exceljs)
// ============================================================

import { prisma } from '../config';
import { analyticsService } from './analytics.service';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import ExcelJS from 'exceljs';

export type ReportType = 'books' | 'transactions' | 'users' | 'overdue' | 'reservations' | 'monthly';
export type ExportFormat = 'pdf' | 'xlsx';

export class ReportService {
  /**
   * Generate a report based on type and format
   */
  async generateReport(type: ReportType, format: ExportFormat): Promise<Buffer> {
    switch (type) {
      case 'books':
        return format === 'pdf' ? this.generateBooksPDF() : this.generateBooksExcel();
      case 'transactions':
        return format === 'pdf' ? this.generateTransactionsPDF() : this.generateTransactionsExcel();
      case 'users':
        return format === 'pdf' ? this.generateUsersPDF() : this.generateUsersExcel();
      case 'overdue':
        return format === 'pdf' ? this.generateOverduePDF() : this.generateOverdueExcel();
      case 'reservations':
        return format === 'pdf' ? this.generateReservationsPDF() : this.generateReservationsExcel();
      case 'monthly':
        if (format !== 'xlsx') throw new Error('Monthly reports are available as Excel workbooks only.');
        return this.generateMonthlyExcel();
      default:
        throw new Error(`Unknown report type: ${type}`);
    }
  }

  // ============================================================
  // PDF GENERATORS
  // ============================================================

  private async createPDF(title: string, headers: string[], rows: string[][]): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    let page = doc.addPage([612, 792]); // US Letter
    const { width, height } = page.getSize();
    const margin = 50;
    const lineHeight = 18;

    // Title
    page.drawText(title, {
      x: margin,
      y: height - margin,
      size: 20,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.3),
    });

    // Date
    const dateStr = new Date().toLocaleDateString('en-PH', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    page.drawText(`Generated: ${dateStr}`, {
      x: margin,
      y: height - margin - 25,
      size: 10,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });

    let y = height - margin - 55;

    // Draw header row
    const colWidth = (width - 2 * margin) / headers.length;
    for (let i = 0; i < headers.length; i++) {
      page.drawText(headers[i], {
        x: margin + i * colWidth + 2,
        y,
        size: 9,
        font: boldFont,
        color: rgb(0.1, 0.1, 0.3),
      });
    }

    // Header underline
    page.drawLine({
      start: { x: margin, y: y - 3 },
      end: { x: width - margin, y: y - 3 },
      thickness: 1,
      color: rgb(0.2, 0.2, 0.2),
    });

    y -= lineHeight;

    // Draw data rows
    for (const row of rows) {
      // Check if we need a new page
      if (y < margin + 40) {
        page = doc.addPage([612, 792]);
        y = height - margin;
      }

      for (let i = 0; i < row.length; i++) {
        page.drawText(String(row[i] || ''), {
          x: margin + i * colWidth + 2,
          y,
          size: 8,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
      }
      y -= lineHeight;
    }

    // Footer with page number
    page.drawText(`Page ${doc.getPageCount()}`, {
      x: width - margin - 40,
      y: margin - 20,
      size: 8,
      font,
      color: rgb(0.6, 0.6, 0.6),
    });

    const pdfBytes = await doc.save();
    return Buffer.from(pdfBytes);
  }

  private async generateBooksPDF(): Promise<Buffer> {
    const books = await prisma.book.findMany({
      include: { category: { select: { name: true } } },
      orderBy: { title: 'asc' },
      take: 500,
    });

    const headers = ['Accession No', 'ISBN', 'Title', 'Author', 'Category', 'Copies', 'Available', 'Status'];
    const rows = books.map((b) => [
      b.accessionNo,
      b.isbn,
      b.title.substring(0, 35),
      b.author.substring(0, 25),
      b.category?.name || '-',
      String(b.copies),
      String(b.availableCopies),
      b.status,
    ]);

    return this.createPDF(`Library Book Catalog (${books.length} books)`, headers, rows);
  }

  private async generateTransactionsPDF(): Promise<Buffer> {
    const txns = await prisma.borrowTransaction.findMany({
      include: {
        user: { select: { firstName: true, lastName: true, libraryId: true } },
        book: { select: { title: true, accessionNo: true } },
      },
      orderBy: { borrowDate: 'desc' },
      take: 500,
    });

    const headers = ['User', 'Library ID', 'Book', 'Accession', 'Borrowed', 'Due', 'Status', 'Fine'];
    const rows = txns.map((t) => [
      `${t.user.firstName} ${t.user.lastName}`,
      t.user.libraryId,
      t.book.title.substring(0, 30),
      t.book.accessionNo,
      t.borrowDate.toLocaleDateString(),
      t.dueDate.toLocaleDateString(),
      t.status,
      t.fineAmount ? `₱${t.fineAmount.toFixed(2)}` : '-',
    ]);

    return this.createPDF(`Transaction History (${txns.length} records)`, headers, rows);
  }

  private async generateUsersPDF(): Promise<Buffer> {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const headers = ['Library ID', 'Name', 'Email', 'Role', 'Department', 'Status', 'Joined'];
    const rows = users.map((u) => [
      u.libraryId,
      `${u.firstName} ${u.lastName}`,
      u.email,
      u.role,
      u.department || '-',
      u.isActive ? 'Active' : 'Inactive',
      u.createdAt.toLocaleDateString(),
    ]);

    return this.createPDF(`Library Users (${users.length} users)`, headers, rows);
  }

  private async generateOverduePDF(): Promise<Buffer> {
    const txns = await prisma.borrowTransaction.findMany({
      where: { status: 'OVERDUE' },
      include: {
        user: { select: { firstName: true, lastName: true, libraryId: true } },
        book: { select: { title: true, accessionNo: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const headers = ['User', 'Library ID', 'Book', 'Due Date', 'Days Overdue', 'Fine'];
    const now = new Date();
    const rows = txns.map((t) => {
      const daysOverdue = Math.ceil((now.getTime() - t.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      return [
        `${t.user.firstName} ${t.user.lastName}`,
        t.user.libraryId,
        t.book.title.substring(0, 30),
        t.dueDate.toLocaleDateString(),
        String(daysOverdue),
        t.fineAmount ? `₱${t.fineAmount.toFixed(2)}` : '₱0.00',
      ];
    });

    return this.createPDF(`Overdue Books Report (${txns.length} items)`, headers, rows);
  }

  private async generateReservationsPDF(): Promise<Buffer> {
    const reservations = await prisma.reservation.findMany({
      where: { status: 'ACTIVE' },
      include: {
        user: { select: { firstName: true, lastName: true, libraryId: true } },
        book: { select: { title: true, accessionNo: true } },
      },
      orderBy: [{ queuePosition: 'asc' }, { reservationDate: 'desc' }],
    });

    const headers = ['Queue', 'User', 'Library ID', 'Book', 'Accession', 'Expires'];
    const rows = reservations.map((r) => [
      String(r.queuePosition),
      `${r.user.firstName} ${r.user.lastName}`,
      r.user.libraryId,
      r.book.title.substring(0, 30),
      r.book.accessionNo,
      r.expiryDate.toLocaleDateString(),
    ]);

    return this.createPDF(`Active Reservations (${reservations.length})`, headers, rows);
  }

  // ============================================================
  // EXCEL GENERATORS
  // ============================================================

  private async createExcel(
    sheetName: string,
    headers: string[],
    rows: (string | number | boolean | Date)[][],
    columnWidths?: number[]
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CPC Library System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(sheetName);

    // Style the header
    const headerStyle: Partial<ExcelJS.Style> = {
      font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1a2e' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      },
    };

    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.style = headerStyle;
    });

    // Add data rows
    rows.forEach((row) => {
      const dataRow = sheet.addRow(row);
      dataRow.eachCell((cell) => {
        cell.style = {
          alignment: { vertical: 'middle' },
          border: {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          },
        };
      });
    });

    // Set column widths
    if (columnWidths) {
      columnWidths.forEach((width, i) => {
        sheet.getColumn(i + 1).width = width;
      });
    } else {
      headers.forEach((_, i) => {
        sheet.getColumn(i + 1).width = 20;
      });
    }

    // Auto filter
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: headers.length },
    };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async generateBooksExcel(): Promise<Buffer> {
    const books = await prisma.book.findMany({
      include: { category: { select: { name: true } } },
      orderBy: { title: 'asc' },
    });

    const headers = ['Accession No', 'ISBN', 'Title', 'Author', 'Publisher', 'Category', 'Copies', 'Available', 'Status', 'Shelf', 'Row'];
    const rows = books.map((b) => [
      b.accessionNo,
      b.isbn,
      b.title,
      b.author,
      b.publisher || '',
      b.category?.name || '',
      b.copies,
      b.availableCopies,
      b.status,
      b.shelf || '',
      b.row || '',
    ]);

    return this.createExcel('Books Catalog', headers, rows, [15, 18, 40, 30, 20, 18, 10, 12, 14, 10, 10]);
  }

  private async generateTransactionsExcel(): Promise<Buffer> {
    const txns = await prisma.borrowTransaction.findMany({
      include: {
        user: { select: { firstName: true, lastName: true, libraryId: true } },
        book: { select: { title: true, accessionNo: true } },
      },
      orderBy: { borrowDate: 'desc' },
    });

    const headers = ['Transaction ID', 'User', 'Library ID', 'Book Title', 'Accession No', 'Borrow Date', 'Due Date', 'Return Date', 'Status', 'Fine', 'Fine Status'];
    const rows = txns.map((t) => [
      t.id,
      `${t.user.firstName} ${t.user.lastName}`,
      t.user.libraryId,
      t.book.title,
      t.book.accessionNo,
      t.borrowDate,
      t.dueDate,
      t.returnDate || '',
      t.status,
      t.fineAmount || 0,
      t.fineAmount && t.fineAmount > 0 ? (t.fineWaived ? 'Waived' : t.finePaid ? 'Paid' : 'Unpaid') : '—',
    ]);

    return this.createExcel('Transactions', headers, rows, [28, 25, 15, 40, 15, 14, 14, 14, 12, 10, 10]);
  }

  private async generateUsersExcel(): Promise<Buffer> {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const headers = ['Library ID', 'First Name', 'Last Name', 'Email', 'Role', 'Department', 'Year/Section', 'Phone', 'Active', 'Registered'];
    const rows = users.map((u) => [
      u.libraryId,
      u.firstName,
      u.lastName,
      u.email,
      u.role,
      u.department || '',
      u.yearSection || '',
      u.phone || '',
      u.isActive ? 'Yes' : 'No',
      u.createdAt,
    ]);

    return this.createExcel('Users', headers, rows, [15, 15, 15, 30, 12, 20, 12, 15, 8, 14]);
  }

  private async generateOverdueExcel(): Promise<Buffer> {
    const txns = await prisma.borrowTransaction.findMany({
      where: { status: 'OVERDUE' },
      include: {
        user: { select: { firstName: true, lastName: true, libraryId: true, email: true, department: true } },
        book: { select: { title: true, accessionNo: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const now = new Date();
    const headers = ['User', 'Library ID', 'Email', 'Department', 'Book', 'Accession', 'Due Date', 'Days Overdue', 'Fine'];
    const rows = txns.map((t) => {
      const daysOverdue = Math.ceil((now.getTime() - t.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      return [
        `${t.user.firstName} ${t.user.lastName}`,
        t.user.libraryId,
        t.user.email,
        t.user.department || '',
        t.book.title,
        t.book.accessionNo,
        t.dueDate,
        daysOverdue,
        t.fineAmount || 0,
      ];
    });

    return this.createExcel('Overdue Books', headers, rows, [25, 15, 30, 20, 40, 15, 14, 14, 10]);
  }

  private async generateReservationsExcel(): Promise<Buffer> {
    const reservations = await prisma.reservation.findMany({
      where: { status: 'ACTIVE' },
      include: {
        user: { select: { firstName: true, lastName: true, libraryId: true, email: true } },
        book: { select: { title: true, accessionNo: true } },
      },
      orderBy: [{ queuePosition: 'asc' }, { reservationDate: 'desc' }],
    });

    const headers = ['Queue #', 'User', 'Library ID', 'Email', 'Book', 'Accession', 'Reserved', 'Expires'];
    const rows = reservations.map((r) => [
      r.queuePosition,
      `${r.user.firstName} ${r.user.lastName}`,
      r.user.libraryId,
      r.user.email,
      r.book.title,
      r.book.accessionNo,
      r.reservationDate,
      r.expiryDate,
    ]);

    return this.createExcel('Active Reservations', headers, rows, [10, 25, 15, 30, 40, 15, 14, 14]);
  }

  private addMonthlyReportSheet(
    workbook: ExcelJS.Workbook,
    sheetName: string,
    title: string,
    headers: string[],
    rows: (string | number | boolean | Date)[][],
    columnWidths: number[]
  ): ExcelJS.Worksheet {
    const sheet = workbook.addWorksheet(sheetName);
    sheet.addRow([title]);
    sheet.mergeCells(1, 1, 1, headers.length);
    sheet.getCell(1, 1).style = {
      font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } },
      alignment: { vertical: 'middle' },
    };
    sheet.getRow(1).height = 28;
    sheet.addRow([`Reporting month: ${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}`]);
    sheet.mergeCells(2, 1, 2, headers.length);
    sheet.getCell(2, 1).font = { italic: true, color: { argb: 'FF52525B' } };
    sheet.addRow([]);

    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.style = {
        font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: { bottom: { style: 'thin', color: { argb: 'FF71717A' } } },
      };
    });

    rows.forEach((row) => {
      const dataRow = sheet.addRow(row);
      dataRow.eachCell((cell) => {
        cell.alignment = { vertical: 'middle' };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFD4D4D8' } } };
      });
    });

    columnWidths.forEach((width, index) => {
      sheet.getColumn(index + 1).width = width;
    });
    sheet.views = [{ state: 'frozen', ySplit: 4 }];
    if (rows.length) {
      sheet.autoFilter = {
        from: { row: 4, column: 1 },
        to: { row: rows.length + 4, column: headers.length },
      };
    }
    return sheet;
  }

  private async generateMonthlyExcel(): Promise<Buffer> {
    const [dashboard, trends, categories, departments, topBooks, fines, returns, requests, inventory, departmentBooks] = await Promise.all([
      analyticsService.getDashboardStats(),
      analyticsService.getMonthlyTrends(12, 'all'),
      analyticsService.getMostBorrowedCategories('month', 10),
      analyticsService.getDepartmentDistribution('month'),
      analyticsService.getTopBorrowedBooks('month', 10),
      analyticsService.getOverdueFinesSummary('month'),
      analyticsService.getReturnPerformance('month'),
      analyticsService.getRequestPipelineStats('month'),
      analyticsService.getInventoryHealth(),
      analyticsService.getMostBorrowedByDepartment('month', undefined, 10),
    ]);
    const overview = dashboard.overview;
    const overdueRate = overview.activeBorrows ? overview.overdueBooks / overview.activeBorrows : 0;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CPC Library System';
    workbook.created = new Date();

    this.addMonthlyReportSheet(workbook, 'Active Borrows', 'Active Borrows', ['Metric', 'Value'], [
      ['Active borrows at report generation', overview.activeBorrows],
    ], [38, 18]);
    this.addMonthlyReportSheet(workbook, 'Overdue Books', 'Overdue Books', ['Metric', 'Value'], [
      ['Overdue books at report generation', overview.overdueBooks],
    ], [38, 18]);
    const overdueRateSheet = this.addMonthlyReportSheet(workbook, 'Overdue Rate', 'Overdue Rate', ['Metric', 'Value'], [
      ['Overdue books as a share of active borrows', overdueRate],
    ], [44, 18]);
    overdueRateSheet.getCell(5, 2).numFmt = '0.0%';

    const unpaidFinesSheet = this.addMonthlyReportSheet(workbook, 'Unpaid Fines', 'Unpaid Fines', ['Metric', 'Amount (PHP)'], [
      ['Unpaid fines for the reporting month', Number(fines.unpaid || 0)],
    ], [38, 20]);
    unpaidFinesSheet.getColumn(2).numFmt = '₱#,##0.00';

    this.addMonthlyReportSheet(workbook, 'Pending Requests', 'Pending Requests', ['Metric', 'Value'], [
      ['Pending requests created this month', requests.pending || 0],
    ], [38, 18]);
    const onTimeSheet = this.addMonthlyReportSheet(workbook, 'On-time Return Rate', 'On-time Return Rate', ['Metric', 'Value'], [
      ['On-time returns this month', returns.onTimeRate / 100],
      ['Returns evaluated', returns.totalReturned],
      ['Returned on time', returns.onTime],
      ['Returned late', returns.late],
    ], [32, 18]);
    onTimeSheet.getCell(5, 2).numFmt = '0.0%';

    this.addMonthlyReportSheet(workbook, 'Monthly Trends', 'Monthly Borrow, Return & Overdue Trends', ['Month', 'Borrows', 'Returns', 'Overdue'], trends.map((item) => [
      item.month, item.borrows, item.returns, item.overdues,
    ]), [18, 14, 14, 14]);
    this.addMonthlyReportSheet(workbook, 'Department Compare', 'Department Borrowing Comparison', ['Department Code', 'Department', 'Borrows'], departments.map((item) => [
      item.code, item.name, item.value,
    ]), [20, 36, 14]);
    this.addMonthlyReportSheet(workbook, 'Top 10 Books', 'Top 10 Most Borrowed Books', ['Title', 'Author', 'Borrows'], topBooks.map((book) => [
      book.title, book.author, book.borrowCount,
    ]), [42, 30, 14]);
    this.addMonthlyReportSheet(workbook, 'Borrowed Categories', 'Most Borrowed Categories', ['Category', 'Category Code', 'Borrows'], categories.data.map((item) => [
      item.name, item.categoryCode, item.borrowCount,
    ]), [34, 18, 14]);
    this.addMonthlyReportSheet(workbook, 'Books by Department', 'Most Borrowed Books by Department', ['Department', 'Book Title', 'Author', 'Category', 'Borrows'], departmentBooks.flatMap((group) => group.topBooks.map((book) => [
      group.department, book.title, book.author, book.category || '', book.borrowCount,
    ])), [24, 42, 30, 24, 14]);
    this.addMonthlyReportSheet(workbook, 'Request Pipeline', 'Request Pipeline', ['Metric', 'Value'], [
      ['Pending', requests.pending],
      ['Approved', requests.approved],
      ['Rejected', requests.rejected],
      ['Approval rate', requests.approvalRate / 100],
      ['Average processing time (hours)', requests.averageApprovalHours],
    ], [34, 20]).getCell(8, 2).numFmt = '0.0%';
    this.addMonthlyReportSheet(workbook, 'Inventory Health', 'Inventory Health', ['Metric', 'Value'], [
      ['Low-stock books', inventory.lowStockCount],
      ['Unavailable books', inventory.unavailableCount],
      ['Never borrowed books', inventory.neverBorrowedCount],
    ], [28, 18]);
    const fineDispositionSheet = this.addMonthlyReportSheet(workbook, 'Fine Disposition', 'Fine Disposition', ['Disposition', 'Amount (PHP)'], [
      ['Unpaid', Number(fines.unpaid || 0)],
      ['Paid', Number(fines.paid || 0)],
      ['Waived', Number(fines.waived || 0)],
      ['Total', Number(fines.total || 0)],
    ], [24, 20]);
    fineDispositionSheet.getColumn(2).numFmt = '₱#,##0.00';

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}

export const reportService = new ReportService();

