"use strict";

const { Activity, Settings } = require("../models");
const { getProject } = require("./projectService");

const DAY = 86400000;
const day = (value) => new Date(new Date(value).toISOString().slice(0, 10) + "T00:00:00.000Z");
const diff = (start, end) => Math.round((day(end) - day(start)) / DAY);
async function calculateEvm(projectId, statusDate) {
  const [project, activities, settings] = await Promise.all([
    getProject(projectId),
    Activity.find({ projectId }).lean(),
    Settings.findOne({ projectId }).lean(),
  ]);
  const date = statusDate ? day(statusDate) : day(settings ? settings.statusDate : new Date());
  const BAC = activities.reduce((sum, activity) => sum + activity.plannedCost, 0);
  const AC = activities.reduce((sum, activity) => sum + activity.actualCost, 0);
  const byActivity = activities.map((activity) => {
    const duration = Math.max(1, activity.durationDays);
    const elapsed = Math.max(0, Math.min(duration, diff(activity.startDate, date) + 1));
    const plannedPercent = activity.isMilestone
      ? date >= day(activity.endDate) ? 100 : 0
      : elapsed / duration * 100;
    return {
      id: String(activity._id), name: activity.name,
      plannedPercentComplete: plannedPercent, actualPercentComplete: activity.percentComplete,
      PV: activity.plannedCost * plannedPercent / 100,
      EV: activity.plannedCost * activity.percentComplete / 100,
      AC: activity.actualCost
    };
  });
  const PV = byActivity.reduce((sum, activity) => sum + activity.PV, 0);
  const EV = byActivity.reduce((sum, activity) => sum + activity.EV, 0);
  const CPI = AC === 0 ? (EV === 0 ? 0 : null) : EV / AC;
  const SPI = PV === 0 ? (EV === 0 ? 0 : null) : EV / PV;
  const CV = EV - AC;
  const SV = EV - PV;
  const settingsValues = {
    cpiWarning: settings ? settings.cpiWarning : Number(process.env.CPI_WARNING || 0.9),
    cpiCritical: settings ? settings.cpiCritical : Number(process.env.CPI_CRITICAL || 0.8),
    spiWarning: settings ? settings.spiWarning : Number(process.env.SPI_WARNING || 0.9),
    spiCritical: settings ? settings.spiCritical : Number(process.env.SPI_CRITICAL || 0.8)
  };
  const warnings = [];
  function warn(label, value, warning, critical) {
    if (value === null || value >= warning) return;
    const severity = value < critical ? "red" : "amber";
    const category = label === "CPI" ? "Cost overrun detected" : "Schedule deviation detected";
    warnings.push({ severity, metric: label, message: `${category}: ${label} ${value.toFixed(2)}` });
  }
  warn("CPI", CPI, settingsValues.cpiWarning, settingsValues.cpiCritical);
  warn("SPI", SPI, settingsValues.spiWarning, settingsValues.spiCritical);
  if (CPI === null) warnings.push({ severity: "amber", metric: "CPI", message: "CPI is unavailable because earned value exists but no actual costs have been recorded." });
  if (SPI === null) warnings.push({ severity: "amber", metric: "SPI", message: "SPI is unavailable because earned value exists but planned value is zero." });
  const effectiveBAC = project.approvedBudget;
  const estimateAtCompletion = CPI && CPI > 0 ? BAC / CPI : AC + (BAC - EV);
  const estimateToComplete = Math.max(0, estimateAtCompletion - AC);
  const varianceAtCompletion = BAC - estimateAtCompletion;
  return {
    statusDate: date, BAC, approvedBudget: effectiveBAC, PV, EV, AC, CPI, SPI, CV, SV,
    EAC: estimateAtCompletion, ETC: estimateToComplete, VAC: varianceAtCompletion,
    warnings, byActivity, thresholds: settingsValues
  };
}

async function costSummary(projectId) {
  const [project, activities] = await Promise.all([getProject(projectId), Activity.find({ projectId }).lean()]);
  const plannedCost = activities.reduce((sum, activity) => sum + activity.plannedCost, 0);
  const actualCost = activities.reduce((sum, activity) => sum + activity.actualCost, 0);
  const approvedBudget = project.approvedBudget;
  return { plannedCost, actualCost, approvedBudget, overBudget: plannedCost > approvedBudget, remainingBudget: approvedBudget - actualCost };
}

module.exports = { calculateEvm, costSummary };
