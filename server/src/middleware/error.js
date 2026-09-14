import { ZodError } from 'zod';
import { HttpError } from '../utils/http.js';

function uniqueFields(err) {
  const target = err.meta?.target ?? err.meta?.driverAdapterError?.cause?.constraint?.fields;
  if (Array.isArray(target)) return target.join(', ');
  if (typeof target === 'string') return target;
  // Driver adapters report the index name, e.g. "products_code_key" → "code"
  const index = err.meta?.driverAdapterError?.cause?.constraint?.index;
  const table = err.meta?.driverAdapterError?.cause?.table;
  if (typeof index === 'string') {
    return index.replace(new RegExp(`^${table ?? '[a-z]+'}_`), '').replace(/_key$/, '').replace(/_/g, ' ');
  }
  return 'value';
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No endpoint for ${req.method} ${req.originalUrl}` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first?.path?.length ? `${first.path.join('.')}: ` : '';
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `${where}${first?.message ?? 'Invalid input'}`,
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
  }

  switch (err?.code) {
    case 'P2002':
      return res.status(409).json({ error: { code: 'CONFLICT', message: `Another record already uses this ${uniqueFields(err)}` } });
    case 'P2003':
      return res.status(409).json({ error: { code: 'IN_USE', message: 'This record is referenced by other data and cannot be changed that way' } });
    case 'P2025':
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found' } });
    default:
      break;
  }

  console.error(`[${req.method} ${req.originalUrl}]`, err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Unexpected server error' } });
}
