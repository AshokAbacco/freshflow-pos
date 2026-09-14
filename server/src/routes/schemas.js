import { z } from 'zod';
import { diffDays, isIsoDate } from '../utils/dates.js';

export const idParam = z.object({ id: z.string().uuid('Invalid id') });

export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
};

export const dateRangeQuery = z
  .object({
    from: z.string().refine(isIsoDate, 'Use YYYY-MM-DD'),
    to: z.string().refine(isIsoDate, 'Use YYYY-MM-DD'),
  })
  .refine((v) => v.from <= v.to, { message: '"from" must be on or before "to"', path: ['from'] })
  .refine((v) => diffDays(v.from, v.to) <= 730, { message: 'Choose a period of two years or less', path: ['to'] });

export const emptyToNull = (schema) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), schema.nullish());
