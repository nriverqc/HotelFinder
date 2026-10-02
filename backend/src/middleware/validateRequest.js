/**
 * @module validateRequest
 * @description Lightweight request validation middleware.
 * Validates that required fields exist in req.body and have correct types.
 * No external dependency needed — uses a simple schema DSL.
 *
 * Usage:
 *   const { validateBody } = require('../middleware/validateRequest');
 *
 *   router.post('/example', validateBody({
 *     hotel_name: { type: 'string', required: true },
 *     currentPrice: { type: 'number', required: true },
 *     currency: { type: 'string', required: false, default: 'USD' },
 *   }), controller.handler);
 */

/**
 * Creates a middleware that validates req.body against a schema.
 * Missing optional fields are filled with their defaults.
 *
 * @param {Object} schema - Object where keys are field names and values are:
 *   - type: 'string' | 'number' | 'boolean' | 'array' | 'object'
 *   - required: boolean (default: false)
 *   - default: any (used when field is missing and not required)
 * @returns {import('express').RequestHandler}
 */
function validateBody(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];
      const isRequired = rules.required === true;

      // Check required fields
      if (value === undefined || value === null || value === '') {
        if (isRequired) {
          errors.push(`Missing required field: '${field}'`);
        } else if (rules.default !== undefined) {
          req.body[field] = rules.default;
        }
        continue;
      }

      // Type validation
      if (rules.type) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;

        // Allow numeric strings for 'number' type (auto-convert)
        if (rules.type === 'number' && typeof value === 'string') {
          const parsed = parseFloat(value);
          if (!isNaN(parsed)) {
            req.body[field] = parsed;
            continue;
          }
        }

        if (actualType !== rules.type) {
          errors.push(`Field '${field}' must be of type '${rules.type}', got '${actualType}'`);
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors,
      });
    }

    next();
  };
}

module.exports = { validateBody };
