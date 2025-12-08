/**
 * Validateurs pour les données d'entrée
 */

export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const validateObjectId = (id) => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

export const validateDate = (date) => {
  return date instanceof Date && !isNaN(date);
};

export const validateTimeRange = (start, end) => {
  if (!start || !end) return false;
  const startDate = new Date(start);
  const endDate = new Date(end);
  return startDate < endDate;
};

export const validateNumberRange = (value, min, max) => {
  const num = Number(value);
  return !isNaN(num) && num >= min && num <= max;
};

/**
 * Middleware de validation générique
 */
export const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      return res.status(400).json({
        success: false,
        error: "Validation error",
        details: errors,
      });
    }

    next();
  };
};

