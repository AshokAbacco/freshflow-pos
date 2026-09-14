const DEFAULT_CODES = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
};

export class HttpError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code || DEFAULT_CODES[status] || 'ERROR';
    this.details = details;
  }
}

/** Forwards async errors to Express' error middleware (Express 4 does not do this natively). */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
