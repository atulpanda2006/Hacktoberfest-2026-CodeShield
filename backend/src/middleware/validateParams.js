import { ApiResponse } from '../utils/apiResponse.js';

/**
 * UUID v1-v5 pattern used by the application's identifiers.
 * Validating route params before they reach Prisma prevents database errors
 * (Prisma throws P2023 for malformed UUIDs) and returns a clean 400 instead.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate one or more route params as UUIDs.
 *
 * @param  {...string} paramNames - Names of req.params entries to validate
 */
export function validateUuidParams(...paramNames) {
  return (req, res, next) => {
    const errors = [];

    for (const name of paramNames) {
      const value = req.params[name];

      if (!value || !UUID_PATTERN.test(value)) {
        errors.push({ field: name, message: `${name} must be a valid UUID` });
      }
    }

    if (errors.length > 0) {
      return ApiResponse.error(res, {
        statusCode: 400,
        message: 'Validation failed',
        errors,
      });
    }

    return next();
  };
}

/**
 * Validate a route param as a positive integer (e.g. GitHub PR numbers, page sizes).
 *
 * @param {string} paramName - Name of the req.params entry to validate
 * @param {{ min?: number }} [options]
 */
export function validateIntParam(paramName, { min = 1 } = {}) {
  return (req, res, next) => {
    const raw = req.params[paramName];
    const value = Number(raw);

    if (!raw || !Number.isInteger(value) || value < min) {
      return ApiResponse.error(res, {
        statusCode: 400,
        message: 'Validation failed',
        errors: [{ field: paramName, message: `${paramName} must be an integer >= ${min}` }],
      });
    }

    return next();
  };
}

export default { validateUuidParams, validateIntParam };
