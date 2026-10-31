"use strict";

const { Project, Activity, ChangeRequest, Defect, Milestone, Requirement, Risk, Settings } = require("../models");
const { getProject } = require("./projectService");
const { calculateEvm } = require("./evmService");
const { calculateDelays } = require("./scheduleService");
const { rankedRisks, defectSummary } = require("./riskService");

async function dashboard(projectId) {
  const project = await getProject(projectId);
  const settings = await Settings.findOne({ projectId: project._id }).lean();
  const [activities, requirements, pendingChangeRequests, defects, risks, milestones, evm, delayData, defectCounts] = await Promise.all([
    Activity.find({ projectId: project._id }).lean(),
    Requirement.countDocuments({ projectId: project._id, status: "Approved" }),
    ChangeRequest.countDocuments({ projectId: project._id, status: "Pending" }),
    Defect.find({ projectId: project._id, severity: "Critical", status: { $nin: ["Resolved", "Closed"] } }).lean(),
    rankedRisks(project._id),
    Milestone.find({ projectId: project._id, status: { $ne: "Completed" } }).sort({ dueDate: 1 }).limit(5).lean(),
    calculateEvm(project._id),
    calculateDelays(project._id, settings ? settings.statusDate : new Date()),
    defectSummary(project._id)
  ]);
  const plannedCost = activities.reduce((sum, activity) => sum + activity.plannedCost, 0);
  const actualCost = activities.reduce((sum, activity) => sum + activity.actualCost, 0);
  const earned = activities.reduce((sum, activity) => sum + activity.plannedCost * activity.percentComplete / 100, 0);
  const overallProgress = plannedCost > 0 ? earned / plannedCost * 100 : 0;
  const changes = await ChangeRequest.find({ projectId: project._id, status: "Approved" }).select("scheduleImpactWeeks").lean();
  const approvedWeeks = changes.reduce((sum, change) => sum + change.scheduleImpactWeeks, 0);
  return {
    project: {
      id: String(project._id), title: project.title, status: project.status,
      startDate: project.startDate, deadline: project.deadline,
      approvedBudget: project.approvedBudget, approvedRequirements: requirements,
      approvedDurationWeeks: Math.round((project.deadline - project.startDate) / 604800000)
    },
    overallProgress,
    budget: { approved: project.approvedBudget, planned: plannedCost, actual: actualCost, overBudget: plannedCost > project.approvedBudget },
    evm: { CPI: evm.CPI, SPI: evm.SPI, CV: evm.CV, SV: evm.SV, warnings: evm.warnings },
    pendingChangeRequests,
    delayedActivities: delayData.activities,
    finalDeadlineImpactDays: delayData.finalDeadlineImpactDays,
    unresolvedCriticalDefects: defects.length,
    defectSummary: defectCounts,
    topRisks: risks.slice(0, 5),
    upcomingMilestones: milestones,
    statusDate: settings ? settings.statusDate : new Date()
  };
}

async function projectReport(projectId) {
  const project = await getProject(projectId);
  const [milestones, teamMembers, requirements, wbsNodes, changeRequests, activities, defects, checklists,
    inspections, risks, pdpcNodes, settings, dashboardData, consistency] = await Promise.all([
    require("../models").Milestone.find({ projectId: project._id }),
    require("../models").TeamMember.find({ projectId: project._id }),
    Requirement.find({ projectId: project._id }),
    require("../models").WbsNode.find({ projectId: project._id }),
    ChangeRequest.find({ projectId: project._id }),
    Activity.find({ projectId: project._id }),
    require("../models").Defect.find({ projectId: project._id }),
    require("../models").Checklist.find({ projectId: project._id }),
    require("../models").Inspection.find({ projectId: project._id }),
    Risk.find({ projectId: project._id }),
    require("../models").PdpcNode.find({ projectId: project._id }),
    Settings.findOne({ projectId: project._id }),
    dashboard(project._id),
    require("./consistencyService").checkConsistency(project._id)
  ]);
  const output = (record) => record && typeof record.toObject === "function" ? record.toObject() : record;
  return {
    project: output(project), milestones: milestones.map(output), teamMembers: teamMembers.map(output),
    requirements: requirements.map(output), wbsNodes: wbsNodes.map(output), changeRequests: changeRequests.map(output),
    activities: activities.map(output), defects: defects.map(output), checklists: checklists.map(output),
    inspections: inspections.map(output), risks: risks.map(output), pdpcNodes: pdpcNodes.map(output),
    settings: output(settings), dashboard: dashboardData, consistency
  };
}

module.exports = { dashboard, projectReport };
