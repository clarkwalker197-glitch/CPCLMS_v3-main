import { Request, Response } from 'express';
import { communityService } from '../services';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/helpers';
import { AuthenticatedRequest } from '../types';

export const listFaqs = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await communityService.listFaqs(req.user?.role === 'LIBRARIAN')));
export const createFaq = asyncHandler(async (req: AuthenticatedRequest, res: Response) => sendSuccess(res, await communityService.createFaq({ ...req.body, createdById: req.user!.userId }), 'FAQ created'));
export const updateFaq = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await communityService.updateFaq(req.params.id, req.body), 'FAQ updated'));
export const deleteFaq = asyncHandler(async (req: Request, res: Response) => { await communityService.deleteFaq(req.params.id); sendSuccess(res, null, 'FAQ deleted'); });

export const createSuggestion = asyncHandler(async (req: AuthenticatedRequest, res: Response) => sendSuccess(res, await communityService.createSuggestion(req.user!.userId, req.body), 'Suggestion submitted'));
export const listMineSuggestions = asyncHandler(async (req: AuthenticatedRequest, res: Response) => sendSuccess(res, await communityService.listSuggestions(req.user!.userId)));
export const listSuggestions = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await communityService.listSuggestions(undefined, req.query.status as string | undefined)));
export const updateSuggestion = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await communityService.updateSuggestion(req.params.id, req.body), 'Suggestion updated'));

export const createAcquisitionRequest = asyncHandler(async (req: AuthenticatedRequest, res: Response) => sendSuccess(res, await communityService.createAcquisitionRequest(req.user!.userId, req.body), 'Book request submitted'));
export const listMineAcquisitionRequests = asyncHandler(async (req: AuthenticatedRequest, res: Response) => sendSuccess(res, await communityService.listAcquisitionRequests(req.user!.userId)));
export const listAcquisitionRequests = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await communityService.listAcquisitionRequests(undefined, req.query.status as string | undefined)));
export const updateAcquisitionRequest = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await communityService.updateAcquisitionRequest(req.params.id, req.body), 'Book request updated'));