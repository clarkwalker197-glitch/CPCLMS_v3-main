import { z } from 'zod';

export const rateSuggestionSchema = z.object({
  body: z.object({
    rating: z.coerce.number().int().min(1).max(5),
  }),
});
