/**
 * Express middleware factory for Zod schema validation.
 * Validates req.body against the provided schema.
 *
 * Usage:
 *   router.post("/register", validate(registerSchema), controller.register);
 */
const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    const errors = result.error?.errors?.map((err) => ({
      field: err.path.join("."),
      message: err.message,
    })) || [];

    console.error('Validation failed:', errors);
    console.error('Request body:', JSON.stringify(req.body, null, 2));

    const error = new Error("Validation failed");
    error.statusCode = 400;
    error.errors = errors;

    // Attach formatted errors to the error object for the error handler
    return next(error);
  }

  // Replace body with parsed (cleaned) data
  req.body = result.data;
  next();
};

export default validate;
