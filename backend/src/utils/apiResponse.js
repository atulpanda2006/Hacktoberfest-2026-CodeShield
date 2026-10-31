/**
 * Standardized API response utility.
 * All API responses follow a consistent format.
 */

export class ApiResponse {
  /**
   * Send a success response
   */
  static success(res, { statusCode = 200, message = 'Success', data = null } = {}) {
    const response = {
      success: true,
      message,
    };

    if (data !== null && data !== undefined) {
      response.data = data;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Send an error response
   */
  static error(res, { statusCode = 500, message = 'Internal Server Error', errors = null } = {}) {
    const response = {
      success: false,
      message,
    };

    if (errors !== null && errors !== undefined) {
      response.errors = errors;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Send a created response (201)
   */
  static created(res, { message = 'Resource created successfully', data = null } = {}) {
    return ApiResponse.success(res, { statusCode: 201, message, data });
  }

  /**
   * Send a no-content response (204)
   */
  static noContent(res) {
    return res.status(204).send();
  }

  /**
   * Send a paginated response.
   * Extra top-level metadata (for example a review `summary`) can be supplied
   * through `extras` without breaking the standard envelope.
   */
  static paginated(res, { data, page, limit, total, message = 'Success', ...extras } = {}) {
    return res.status(200).json({
      success: true,
      message,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
      ...extras,
    });
  }
}

export default ApiResponse;
