/** Parse and replace req.params / req.query / req.body with zod-validated values. */
export const validate = (schemas) => (req, _res, next) => {
  try {
    for (const key of ['params', 'query', 'body']) {
      if (schemas[key]) req[key] = schemas[key].parse(req[key] ?? {});
    }
    next();
  } catch (err) {
    next(err);
  }
};
