import { z } from 'zod';

const libraryInfoSchema = z.object({
  title: z.string().trim().min(2, 'Policy title must be at least 2 characters').max(200),
  introduction: z.string().trim().min(2, 'Introduction is required').max(2000),
  location: z.string().trim().min(2, 'Location is required').max(200),
  address: z.string().trim().min(2, 'Address is required').max(500),
  openingHours: z.string().trim().min(1, 'Opening hours are required').max(100),
  closingHours: z.string().trim().min(1, 'Closing hours are required').max(100),
  rules: z.array(z.string().trim().min(1, 'Library rules cannot be empty')).min(1, 'At least one library rule is required'),
  librarianName: z.string().trim().min(2, 'Librarian name is required').max(200),
  librarianPosition: z.string().trim().min(2, 'Librarian position is required').max(200),
  librarianEmail: z.string().trim().email('Enter a valid librarian email address').max(254),
  librarianExtension: z.string().trim().min(1, 'Librarian extension is required').max(100),
  librarianOffice: z.string().trim().min(2, 'Librarian office is required').max(300),
  services: z.array(z.string().trim().min(1, 'Library services cannot be empty')).min(1, 'At least one library service is required'),
});

export const updatePolicySchema = z.object({
  body: z.object({
    key: z.string()
      .trim()
      .min(1, 'Policy key is required')
      .max(100, 'Policy key cannot exceed 100 characters')
      .regex(/^[A-Za-z0-9_-]+$/, 'Policy key contains invalid characters'),
    value: z.string()
      .trim()
      .min(1, 'Policy content cannot be empty')
      .max(2000, 'Policy content cannot exceed 2000 characters'),
    description: z.string().trim().max(500, 'Description cannot exceed 500 characters').optional(),
    expectedUpdatedAt: z.string().datetime().nullable(),
  }).superRefine((policy, ctx) => {
    if (policy.key !== 'LIBRARY_INFO') return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(policy.value);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Library information must be valid JSON',
      });
      return;
    }

    const result = libraryInfoSchema.safeParse(parsed);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value', ...issue.path],
          message: issue.message,
        });
      }
    }
  }),
});
