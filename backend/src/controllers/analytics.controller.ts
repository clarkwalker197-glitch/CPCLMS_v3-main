// ============================================================
// Analytics Controller
// ============================================================

import { Request, Response } from 'express';
import { analyticsService } from '../services';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/helpers';
import { AuthenticatedRequest } from '../types';

export const getDashboardStats = asyncHandler(async (_req: Request, res: Response) => {
  const stats = await analyticsService.getDashboardStats();
  sendSuccess(res, stats);
});

export const getMyDashboardStats = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const stats = await analyticsService.getMyDashboardStats(req.user!.userId);
    sendSuccess(res, stats);
  }
);

export const getMonthlyTrends = asyncHandler(async (req: Request, res: Response) => {
  const months = parseInt(req.query.months as string) || 6;
  const trends = await analyticsService.getMonthlyTrends(months, req.query.range as string | undefined);
  sendSuccess(res, trends);
});

export const getMostBorrowedCategories = asyncHandler(async (req: Request, res: Response) => {
  const range = req.query.range as string | undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const distribution = await analyticsService.getMostBorrowedCategories(range, limit);
  sendSuccess(res, distribution);
});

export const getDepartmentDistribution = asyncHandler(async (req: Request, res: Response) => {
  const distribution = await analyticsService.getDepartmentDistribution(req.query.range as string | undefined);
  sendSuccess(res, distribution);
});

export const getOverdueFinesSummary = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await analyticsService.getOverdueFinesSummary(req.query.range as string | undefined));
});

export const getTopBorrowedBooks = asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  sendSuccess(res, await analyticsService.getTopBorrowedBooks(req.query.range as string | undefined, limit));
});

export const getReturnPerformance = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await analyticsService.getReturnPerformance(req.query.range as string | undefined));
});

export const getRequestPipelineStats = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await analyticsService.getRequestPipelineStats(req.query.range as string | undefined));
});

export const getInventoryHealth = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await analyticsService.getInventoryHealth());
});

export const getMemberEngagement = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await analyticsService.getMemberEngagement(req.query.range as string | undefined));
});

export const getMostBorrowedByDepartment = asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  sendSuccess(res, await analyticsService.getMostBorrowedByDepartment(req.query.range as string | undefined, req.query.department as string | undefined, limit));
});

