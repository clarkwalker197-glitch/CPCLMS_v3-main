import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/helpers';
import {
  getPushPublicKey,
  removePushSubscription,
  savePushSubscription,
} from '../services/push.service';

export const getPublicKey = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  sendSuccess(res, await getPushPublicKey());
});

export const subscribe = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await savePushSubscription(req.user!.userId, req.body);
  sendSuccess(res, null, 'System notifications enabled');
});

export const unsubscribe = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await removePushSubscription(req.user!.userId, req.body.endpoint);
  sendSuccess(res, null, 'System notifications disabled');
});
