"use strict";

module.exports = function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error.status || (error.code === 11000 ? 409 : error.name === "ValidationError" ? 400 : error.name === "CastError" ? 400 : 500);
  const errors = error.errors
    ? Object.values(error.errors).map((item) => item.message)
    : error.code === 11000
      ? ["A record with this unique value already exists."]
      : Array.isArray(error.details)
        ? error.details.map((item) => item.msg || item.message)
        : [];
  const message = error.code === 11000
    ? "A record with this unique value already exists."
    : status >= 500 && process.env.NODE_ENV === "production"
      ? "An unexpected server error occurred."
      : error.message || "An unexpected server error occurred.";
  if (status >= 500) console.error("Request failed:", error.message);
  res.status(status).json({ success: false, message, errors });
};
