import { Router } from 'express';
import { z } from 'zod';
import { authorize, ROLES } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { categoryReport, overviewReport, productReport } from '../services/report.service.js';
import { asyncHandler } from '../utils/http.js';
import { dateRangeQuery, pagination } from './schemas.js';

const router = Router();

// Daily Business Report & Analytics are admin-only; cashiers receive 403 for every route below.
router.use(authorize(ROLES.ADMIN));

router.get(
  '/overview',
  validate({ query: dateRangeQuery }),
  asyncHandler(async (req, res) => {
    res.json(await overviewReport(req.user.organizationId, req.query.from, req.query.to));
  }),
);

router.get(
  '/categories',
  validate({ query: z.intersection(dateRangeQuery, z.object({ level: z.enum(['leaf', 'top']).default('leaf') })) }),
  asyncHandler(async (req, res) => {
    res.json(await categoryReport(req.user.organizationId, req.query.from, req.query.to, req.query.level));
  }),
);

router.get(
  '/products',
  validate({
    query: z.intersection(
      dateRangeQuery,
      z.object({
        ...pagination,
        q: z.string().trim().max(100).default(''),
        sort: z.enum(['revenue', 'units', 'growth', 'stock', 'name']).default('revenue'),
      }),
    ),
  }),
  asyncHandler(async (req, res) => {
    res.json(await productReport(req.user.organizationId, req.query));
  }),
);

export default router;
