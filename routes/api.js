"use strict";

const express = require("express");
const { body, param, query } = require("express-validator");
const asyncHandler = require("../middleware/asyncHandler");
const validate = require("../middleware/validate");
const registry = require("../services/modelRegistry");
const crud = require("../controllers/crudController");
const business = require("../controllers/businessController");
const router = express.Router();

const objectIdParam = param("id").isMongoId().withMessage("A valid MongoDB record id is required.");
const statusDateQuery = query("statusDate").optional({ values: "falsy" }).isISO8601().withMessage("statusDate must be a valid ISO date.");
const objectBody = body().isObject().withMessage("Request body must be a JSON object.");

router.post("/change-requests/:id/approve", objectIdParam, validate, asyncHandler(business.approve));
router.post("/change-requests/:id/reject", objectIdParam, validate, asyncHandler(business.reject));
router.get("/scope/approved", asyncHandler(business.approvedScope));
router.post("/wbs/generate", asyncHandler(business.generateWbs));
router.get("/wbs/tree", asyncHandler(business.wbsTree));
router.get("/schedule", asyncHandler(business.getSchedule));
router.get("/schedule/delays", statusDateQuery, validate, asyncHandler(business.getDelays));
router.get("/evm/by-activity", statusDateQuery, validate, asyncHandler(business.getEvmByActivity));
router.get("/evm", statusDateQuery, validate, asyncHandler(business.getEvm));
router.get("/cost/summary", asyncHandler(business.getCostSummary));
router.get("/risks/ranked", asyncHandler(business.getRankedRisks));
router.get("/risks/matrix", asyncHandler(business.getRiskMatrix));
router.get("/pdpc/tree", asyncHandler(business.getPdpcTree));
router.get("/defects/summary", asyncHandler(business.getDefectSummary));
router.get("/dashboard", asyncHandler(business.getDashboard));
router.get("/consistency", asyncHandler(business.getConsistency));
router.get("/report", asyncHandler(business.getReport));

router.get("/:collection", asyncHandler(crud.list));
router.get("/:collection/:id", objectIdParam, validate, asyncHandler(crud.getById));
router.post("/:collection", objectBody, validate, asyncHandler(crud.create));
router.put("/:collection/:id", objectIdParam, objectBody, validate, asyncHandler(crud.update));
router.delete("/:collection/:id", objectIdParam, validate, asyncHandler(crud.remove));

module.exports = router;
