"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;

const objectId = Schema.Types.ObjectId;
const projectRef = { type: objectId, ref: "Project", required: true, index: true };
const optionalText = { type: String, trim: true, default: "" };
const personSchema = new Schema({ name: { type: String, required: true, trim: true }, role: { type: String, required: true, trim: true } }, { _id: false });
const planSchema = new Schema({
  scope: optionalText, schedule: optionalText, cost: optionalText, quality: optionalText
}, { _id: false });
const closureSchema = new Schema({
  lessonsLearned: optionalText,
  finalCost: { type: Number, min: 0, default: 0 },
  completionDate: { type: Date, default: null },
  signOff: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" }
}, { _id: false });

const projectSchema = new Schema({
  title: { type: String, required: true, trim: true, unique: true },
  objectives: { type: [String], default: [] },
  stakeholders: { type: [personSchema], default: [] },
  scopeIn: { type: [String], default: [] },
  scopeOut: { type: [String], default: [] },
  approvedBudget: { type: Number, required: true, min: 0 },
  originalBudget: { type: Number, required: true, min: 0 },
  startDate: { type: Date, required: true },
  deadline: { type: Date, required: true },
  originalDeadline: { type: Date, required: true },
  status: { type: String, enum: ["Not Started", "In Progress", "On Hold", "Completed"], default: "Not Started" },
  plan: { type: planSchema, default: () => ({}) },
  closure: { type: closureSchema, default: null }
}, { timestamps: true });
projectSchema.pre("validate", function validateProject(next) {
  if (this.startDate && this.deadline < this.startDate) this.invalidate("deadline", "Deadline must be on or after project start date.");
  if (this.startDate && this.originalDeadline < this.startDate) this.invalidate("originalDeadline", "Original deadline must be on or after project start date.");
  next();
});
projectSchema.index({ status: 1 });

const milestoneSchema = new Schema({
  name: { type: String, required: true, trim: true },
  dueDate: { type: Date, required: true },
  status: { type: String, enum: ["Not Started", "In Progress", "Completed"], default: "Not Started" },
  projectId: projectRef
}, { timestamps: true });
milestoneSchema.index({ projectId: 1, name: 1 }, { unique: true });

const teamMemberSchema = new Schema({
  name: { type: String, required: true, trim: true },
  role: { type: String, required: true, trim: true },
  responsibility: optionalText,
  email: { type: String, trim: true, lowercase: true, default: "" },
  projectId: projectRef
}, { timestamps: true });
teamMemberSchema.index({ projectId: 1, name: 1 }, { unique: true });
teamMemberSchema.index({ projectId: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $gt: "" } } });

const requirementSchema = new Schema({
  title: { type: String, required: true, trim: true },
  description: optionalText,
  priority: { type: String, enum: ["High", "Medium", "Low"], default: "Medium" },
  status: { type: String, enum: ["Proposed", "Approved", "Rejected"], default: "Proposed", index: true },
  changeRequestId: { type: objectId, ref: "ChangeRequest", default: null },
  projectId: projectRef
}, { timestamps: true });
requirementSchema.index({ projectId: 1, title: 1 }, { unique: true });

const wbsNodeSchema = new Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ["Project", "Deliverable", "WorkPackage"], required: true },
  parentId: { type: objectId, ref: "WbsNode", default: null, index: true },
  requirementId: { type: objectId, ref: "Requirement", default: null },
  projectId: projectRef
}, { timestamps: true });
wbsNodeSchema.index({ projectId: 1, parentId: 1, name: 1 }, { unique: true });

const changeSnapshotSchema = new Schema({
  budget: { type: Number, min: 0 },
  deadline: Date,
  durationWeeks: { type: Number, min: 0 }
}, { _id: false });
const changeRequestSchema = new Schema({
  title: { type: String, required: true, trim: true },
  description: optionalText,
  justification: optionalText,
  costImpact: { type: Number, required: true, min: 0 },
  scheduleImpactWeeks: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending", index: true },
  requirementIds: [{ type: objectId, ref: "Requirement" }],
  decisionDate: { type: Date, default: null },
  before: { type: changeSnapshotSchema, default: undefined },
  after: { type: changeSnapshotSchema, default: undefined },
  projectId: projectRef
}, { timestamps: true });
changeRequestSchema.index({ projectId: 1, title: 1 }, { unique: true });

const activitySchema = new Schema({
  name: { type: String, required: true, trim: true },
  assigneeId: { type: objectId, ref: "TeamMember", default: null },
  durationDays: { type: Number, required: true, min: 0 },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  percentComplete: { type: Number, min: 0, max: 100, default: 0 },
  predecessors: [{ type: objectId, ref: "Activity" }],
  plannedCost: { type: Number, min: 0, default: 0 },
  actualCost: { type: Number, min: 0, default: 0 },
  requirementId: { type: objectId, ref: "Requirement", default: null },
  isMilestone: { type: Boolean, default: false },
  projectId: projectRef
}, { timestamps: true });
activitySchema.pre("validate", function validateActivity(next) {
  if (this.startDate && this.endDate < this.startDate) this.invalidate("endDate", "End date must be on or after start date.");
  if (this.predecessors && this.predecessors.some((id) => id.equals(this._id))) this.invalidate("predecessors", "An activity cannot depend on itself.");
  next();
});
activitySchema.index({ projectId: 1, name: 1 }, { unique: true });

const defectSchema = new Schema({
  title: { type: String, required: true, trim: true },
  module: { type: String, required: true, trim: true },
  severity: { type: String, enum: ["Critical", "High", "Medium", "Low"], required: true },
  assigneeId: { type: objectId, ref: "TeamMember", default: null },
  status: { type: String, enum: ["Open", "In Progress", "Resolved", "Closed"], default: "Open" },
  dateReported: { type: Date, required: true },
  resolvedDate: { type: Date, default: null },
  projectId: projectRef
}, { timestamps: true });
defectSchema.index({ projectId: 1, title: 1 }, { unique: true });

const checklistItemSchema = new Schema({
  text: { type: String, required: true, trim: true },
  checked: { type: Boolean, default: false }
});
const checklistSchema = new Schema({
  deliverable: { type: String, required: true, trim: true },
  items: { type: [checklistItemSchema], default: [] },
  projectId: projectRef
}, { timestamps: true });
checklistSchema.index({ projectId: 1, deliverable: 1 }, { unique: true });

const inspectionSchema = new Schema({
  deliverable: { type: String, required: true, trim: true },
  testName: { type: String, required: true, trim: true },
  expected: { type: String, required: true, trim: true },
  actual: { type: String, required: true, trim: true },
  result: { type: String, enum: ["Pass", "Fail"], required: true },
  date: { type: Date, required: true },
  testerId: { type: objectId, ref: "TeamMember", default: null },
  projectId: projectRef
}, { timestamps: true });

const riskSchema = new Schema({
  title: { type: String, required: true, trim: true },
  description: optionalText,
  likelihood: { type: Number, required: true, min: 1, max: 5 },
  impact: { type: Number, required: true, min: 1, max: 5 },
  score: { type: Number, min: 1, max: 25 },
  projectId: projectRef
}, { timestamps: true });
riskSchema.pre("validate", function calculateRiskScore(next) {
  this.score = this.likelihood * this.impact;
  next();
});
riskSchema.index({ projectId: 1, score: -1 });
riskSchema.index({ projectId: 1, title: 1 }, { unique: true });

const pdpcNodeSchema = new Schema({
  type: { type: String, enum: ["Objective", "Risk", "Preventive", "Corrective"], required: true },
  text: { type: String, required: true, trim: true },
  parentId: { type: objectId, ref: "PdpcNode", default: null, index: true },
  projectId: projectRef
}, { timestamps: true });

const settingsSchema = new Schema({
  cpiWarning: { type: Number, min: 0, default: 0.9 },
  cpiCritical: { type: Number, min: 0, default: 0.8 },
  spiWarning: { type: Number, min: 0, default: 0.9 },
  spiCritical: { type: Number, min: 0, default: 0.8 },
  statusDate: { type: Date, default: Date.now },
  projectId: { ...projectRef, unique: true }
}, { timestamps: true });
settingsSchema.pre("validate", function validateThresholds(next) {
  if (this.cpiCritical >= this.cpiWarning) this.invalidate("cpiCritical", "Critical CPI threshold must be below warning threshold.");
  if (this.spiCritical >= this.spiWarning) this.invalidate("spiCritical", "Critical SPI threshold must be below warning threshold.");
  next();
});
function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

module.exports = {
  Project: model("Project", projectSchema),
  Milestone: model("Milestone", milestoneSchema),
  TeamMember: model("TeamMember", teamMemberSchema),
  Requirement: model("Requirement", requirementSchema),
  WbsNode: model("WbsNode", wbsNodeSchema),
  ChangeRequest: model("ChangeRequest", changeRequestSchema),
  Activity: model("Activity", activitySchema),
  Defect: model("Defect", defectSchema),
  Checklist: model("Checklist", checklistSchema),
  Inspection: model("Inspection", inspectionSchema),
  Risk: model("Risk", riskSchema),
  PdpcNode: model("PdpcNode", pdpcNodeSchema),
  Settings: model("Settings", settingsSchema)
};
