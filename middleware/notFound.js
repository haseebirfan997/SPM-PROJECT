"use strict";

module.exports = function notFound(req, res, next) {
  const error = new Error("The requested endpoint was not found.");
  error.status = 404;
  next(error);
};
