// ============================================================
// Zod Request Validation Middleware
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { sendError } from '../utils/helpers';

/**
 * Validates request body, query, and params against a Zod schema.
 * @param schema - A Zod schema with optional `body`, `query`, `params` keys
 */
export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      if (parsed.body !== undefined) req.body = parsed.body;
      if (parsed.query !== undefined) req.query = parsed.query;
      if (parsed.params !== undefined) req.params = parsed.params;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors
          .map((e) => `${e.path.join('.').replace(/^body\./, '') || 'request'}: ${e.message}`)
          .join('; ');
        sendError(res, formattedErrors, 400);
        return;
      }
      sendError(res, 'Validation failed', 400);
    }
  };
};

