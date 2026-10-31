/**
 * Generic request validation middleware backed by Zod.
 * Body validation lives next to each module; query validation is shared here
 * because list endpoints follow the same pattern.
 */
export function validateQuery(schema) {
  return async (req, res, next) => {
    try {
      req.validatedQuery = await schema.parseAsync(req.query ?? {});
      next();
    } catch (error) {
      next(error);
    }
  };
}

export default { validateQuery };
