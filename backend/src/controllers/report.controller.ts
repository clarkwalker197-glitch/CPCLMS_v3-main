// ============================================================
// Report Generation Controller
// ============================================================

import { Request, Response } from 'express';
import { reportService, ReportType, ExportFormat } from '../services/report.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendError } from '../utils/helpers';

export const generateReport = asyncHandler(async (req: Request, res: Response) => {
  const type = req.params.type as ReportType;
  const format = (req.query.format as ExportFormat) || 'pdf';
  const range = (req.query.range as string) || 'monthly';
  const department = (req.query.department as string) || undefined;

  const validTypes: ReportType[] = ['books', 'transactions', 'users', 'overdue', 'reservations', 'monthly'];
  const validFormats: ExportFormat[] = ['pdf', 'xlsx'];

  if (!validTypes.includes(type)) {
    sendError(res, `Invalid report type. Valid: ${validTypes.join(', ')}`);
    return;
  }
  if (!validFormats.includes(format)) {
    sendError(res, `Invalid format. Valid: ${validFormats.join(', ')}`);
    return;
  }
  if (type === 'monthly' && format !== 'xlsx') {
    sendError(res, 'Monthly reports are available as Excel workbooks only.');
    return;
  }
  const validRanges = ['monthly', 'quarterly', 'semester', 'annual'];
  if (type === 'monthly' && !validRanges.includes(range)) {
    sendError(res, `Invalid report period. Valid: ${validRanges.join(', ')}`);
    return;
  }

  const buffer = await reportService.generateReport(type, format, range, department);

  const date = new Date();
  const periodSuffix = range === 'quarterly'
    ? `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`
    : range === 'semester'
      ? `${date.getFullYear()}-S${date.getMonth() < 6 ? 1 : 2}`
      : range === 'annual'
        ? `${date.getFullYear()}`
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const filename = type === 'monthly'
    ? `cpc-library-${range}-report-${periodSuffix}`
    : `cpc-library-${type}-${date.toISOString().split('T')[0]}`;
  const contentType = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const extension = format === 'pdf' ? 'pdf' : 'xlsx';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.${extension}"`);
  res.send(buffer);
});
