"use strict";

const models = require("../models");

const registry = Object.freeze({
  projects: models.Project,
  milestones: models.Milestone,
  teamMembers: models.TeamMember,
  requirements: models.Requirement,
  wbsNodes: models.WbsNode,
  changeRequests: models.ChangeRequest,
  activities: models.Activity,
  defects: models.Defect,
  checklists: models.Checklist,
  inspections: models.Inspection,
  risks: models.Risk,
  pdpcNodes: models.PdpcNode,
  settings: models.Settings
});

module.exports = registry;
