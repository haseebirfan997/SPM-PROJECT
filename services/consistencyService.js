"use strict";

const models = require("../models");

const message = (severity, code, text) => ({ severity, code, message: text });

async function checkConsistency(projectId) {
  const [project, team, requirements, changes, wbs, activities, defects, inspections, risks] = await Promise.all([
    models.Project.findById(projectId),
    models.TeamMember.find({}),
    models.Requirement.find({ projectId }),
    models.ChangeRequest.find({ projectId }),
    models.WbsNode.find({ projectId }),
    models.Activity.find({ projectId }),
    models.Defect.find({ projectId }),
    models.Inspection.find({ projectId }),
    models.Risk.find({ projectId })
  ]);
  const issues = [];
  if (!project) return [message("error", "project-missing", "No project exists for these project records.")];
  const teamIds = new Set(team.map((item) => String(item._id)));
  const requirementMap = new Map(requirements.map((item) => [String(item._id), item]));
  const changeMap = new Map(changes.map((item) => [String(item._id), item]));
  activities.forEach((activity) => {
    if (activity.assigneeId && !teamIds.has(String(activity.assigneeId))) issues.push(message("error", "activity-assignee", `Activity "${activity.name}" is assigned to a non-project team member.`));
    if (activity.requirementId && (!requirementMap.has(String(activity.requirementId)) || requirementMap.get(String(activity.requirementId)).status !== "Approved")) {
      issues.push(message("error", "activity-requirement", `Activity "${activity.name}" is linked to a missing or unapproved requirement.`));
    }
  });
  defects.forEach((defect) => {
    if (defect.assigneeId && !teamIds.has(String(defect.assigneeId))) issues.push(message("error", "defect-assignee", `Defect "${defect.title}" is assigned to a non-project team member.`));
  });
  inspections.forEach((inspection) => {
    if (inspection.testerId && !teamIds.has(String(inspection.testerId))) issues.push(message("error", "inspection-tester", `Inspection "${inspection.testName}" has a non-project tester.`));
  });
  requirements.forEach((requirement) => {
    const linked = wbs.some((node) => node.requirementId && node.requirementId.equals(requirement._id));
    const assigned = activities.some((activity) => activity.requirementId && activity.requirementId.equals(requirement._id));
    if (requirement.status === "Approved" && !linked && !assigned) issues.push(message("warning", "requirement-unplanned", `Approved requirement "${requirement.title}" has no WBS node or activity.`));
    if (requirement.status !== "Approved" && linked) issues.push(message("error", "unapproved-wbs", `Unapproved requirement "${requirement.title}" appears in the WBS.`));
  });
  changes.forEach((change) => {
    const linkedRequirements = change.requirementIds.map((id) => requirementMap.get(String(id))).filter(Boolean);
    if (change.requirementIds.some((id) => !requirementMap.has(String(id)))) issues.push(message("error", "change-requirement", `Change request "${change.title}" links to a missing requirement.`));
    if (change.status === "Approved") {
      if (linkedRequirements.some((requirement) => requirement.status !== "Approved")) issues.push(message("error", "change-scope", `Approved change request "${change.title}" has an unapproved requirement.`));
        const applied = project.approvedBudget >= (change.after && change.after.budget || Infinity) ||
          project.deadline >= (change.after && change.after.deadline || new Date(8640000000000000));
        if (!change.before || !change.after || !applied) issues.push(message("error", "change-snapshot", `Approved change request "${change.title}" is missing an applied budget or schedule snapshot.`));
    }
  });
  if (project) {
    const plannedCost = activities.reduce((sum, activity) => sum + activity.plannedCost, 0);
    if (plannedCost > project.approvedBudget) issues.push(message("warning", "planned-cost-over-budget", "Total planned activity cost exceeds the approved project budget."));
  }
  if (!issues.length) issues.push(message("ok", "consistent", "Project records pass the configured consistency checks."));
  return issues;
}

module.exports = { checkConsistency };
