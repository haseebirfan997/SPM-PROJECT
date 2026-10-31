"use strict";

const { Project, Activity, ChangeRequest, Defect, Milestone, Requirement, Settings } = require("../models");
const { getProject } = require("../services/projectService");
const scope = require("../services/scopeService");
const schedule = require("../services/scheduleService");
const evm = require("../services/evmService");
const risk = require("../services/riskService");
const { dashboard, projectReport } = require("../services/dashboardService");
const { checkConsistency } = require("../services/consistencyService");
const { respondData, httpError } = require("./crudController");

async function resolveProject(req) {
  return getProject(req.query.projectId);
}

async function approve(req, res) {
  const result = await scope.approveChangeRequest(req.params.id, req.query.projectId);
  const data = {
    changeRequest: respondData(result.request),
    before: { ...result.before, budgetFormatted: `PKR ${result.before.budget.toLocaleString("en-PK")}` },
    after: { ...result.after, budgetFormatted: `PKR ${result.after.budget.toLocaleString("en-PK")}` },
    summary: `${result.before.budget.toLocaleString("en-PK")} -> ${result.after.budget.toLocaleString("en-PK")} PKR; ${result.before.durationWeeks} -> ${result.after.durationWeeks} weeks`
  };
  res.json({ success: true, data, message: "Change request approved; budget, schedule and scope have been updated." });
}

async function reject(req, res) {
  const result = await scope.rejectChangeRequest(req.params.id, req.query.projectId);
  res.json({ success: true, data: respondData(result), message: "Change request rejected; linked requirements remain outside approved scope." });
}

async function approvedScope(req, res) {
  const project = await resolveProject(req);
  res.json({ success: true, data: respondData(await scope.approvedScope(project._id)), message: "Approved requirements loaded." });
}

async function generateWbs(req, res) {
  const project = await resolveProject(req);
  res.json({ success: true, data: await scope.generateWbs(project._id), message: "WBS generated from approved requirements only." });
}

async function wbsTree(req, res) {
  const project = await resolveProject(req);
  res.json({ success: true, data: await scope.getWbsTree(project._id), message: "WBS tree loaded." });
}

async function getSchedule(req, res) {
  const project = await resolveProject(req);
  res.json({ success: true, data: await schedule.calculateSchedule(project._id), message: "Schedule calculated." });
}

async function getDelays(req, res) {
  const project = await resolveProject(req);
  const statusDate = req.query.statusDate ? new Date(req.query.statusDate) : new Date();
  res.json({ success: true, data: await schedule.calculateDelays(project._id, statusDate), message: "Activity delays calculated." });
}

async function getEvm(req, res) {
  const project = await resolveProject(req);
  const data = await evm.calculateEvm(project._id, req.query.statusDate);
  res.json({ success: true, data, message: "Earned value calculated." });
}

async function getEvmByActivity(req, res) {
  const project = await resolveProject(req);
  const data = await evm.calculateEvm(project._id, req.query.statusDate);
  res.json({ success: true, data: data.byActivity, message: "Activity earned value loaded." });
}

async function getCostSummary(req, res) {
  const project = await resolveProject(req);
  res.json({ success: true, data: await evm.costSummary(project._id), message: "Cost summary calculated." });
}

async function getRankedRisks(req, res) {
  const project = await resolveProject(req);
  res.json({ success: true, data: await risk.rankedRisks(project._id), message: "Ranked risks loaded." });
}

async function getRiskMatrix(req, res) {
  const project = await resolveProject(req);
  res.json({ success: true, data: await risk.riskMatrix(project._id), message: "Risk matrix loaded." });
}

async function getPdpcTree(req, res) {
  const project = await resolveProject(req);
  res.json({ success: true, data: await risk.pdpcTree(project._id), message: "PDPC tree loaded." });
}

async function getDefectSummary(req, res) {
  const project = await resolveProject(req);
  res.json({ success: true, data: await risk.defectSummary(project._id), message: "Defect summary loaded." });
}

async function getDashboard(req, res) {
  const project = await resolveProject(req);
  res.json({ success: true, data: await dashboard(project._id), message: "Dashboard data loaded." });
}

async function getConsistency(req, res) {
  const project = await resolveProject(req);
  res.json({ success: true, data: await checkConsistency(project._id), message: "Project consistency checked." });
}

async function getReport(req, res) {
  const project = await resolveProject(req);
  res.json({ success: true, data: await projectReport(project._id), message: "Project report loaded." });
}

function validateDate(req, res, next) {
  if (req.query.statusDate && Number.isNaN(Date.parse(req.query.statusDate))) return next(httpError(400, "statusDate must be a valid date."));
  next();
}

module.exports = {
  approve, reject, approvedScope, generateWbs, wbsTree, getSchedule, getDelays,
  getEvm, getEvmByActivity, getCostSummary, getRankedRisks, getRiskMatrix,
  getPdpcTree, getDefectSummary, getDashboard, getConsistency, getReport, validateDate
};
