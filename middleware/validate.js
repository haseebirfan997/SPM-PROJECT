"use strict";

const { validationResult } = require("express-validator");

module.exports = function validate(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const errors = result.array().map((item) => item.msg);
    return res.status(400).json({ success: false, message: "Request validation failed.", errors });
  }
  next();
};
