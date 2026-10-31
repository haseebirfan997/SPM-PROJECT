"use strict";

const mongoose = require("mongoose");
const models = require("../models");
const registry = require("../services/modelRegistry");
const { getProject } = require("../services/projectService");
const { ensureAcyclic } = require("../services/scheduleService");
const { generateWbs } = require("../services/scopeService");

function respondData(record) {
  if (Array.isArray(record)) return record.map(respondData);
  const plain = record && typeof record.toObject === "function"
    ? record.toObject({ virtuals: true })
    : record;
  function normalize(value) {
    if (Array.isArray(value)) return value.map(normalize);
    if (!value || typeof value !== "object" || value instanceof Date) return value;
    if (value._bsontype === "ObjectId") return String(value);
    const output = {};
    Object.keys(value).forEach((key) => {
      if (key === "__v") return;
      if (key === "_id") output.id = String(value._id);
      else if (key !== "id" || !value._id) output[key] = normalize(value[key]);
    });
    return output;
  }
  return normalize(plain);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cleanBody(body) {
  const cleaned = { ...body };
  ["_id", "id", "__v", "createdAt", "updatedAt", "projectId"].forEach((key) => delete cleaned[key]);
  return cleaned;
}

async function getProjectScope(req, Model) {
  if (Model === models.Project) return null;
  const project = await getProject(req.query.projectId);
  return project._id;
}

async function list(req, res) {
  const Model = registry[req.params.collection];
  if (!Model) throw httpError(404, "Collection not found.");
  const projectId = await getProjectScope(req, Model);
  const records = await Model.find(projectId ? { projectId } : {}).sort({ createdAt: 1 });
  res.json({ success: true, data: respondData(records), message: "Records loaded." });
}

async function getById(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, "A valid record id is required.");
  const Model = registry[req.params.collection];
  if (!Model) throw httpError(404, "Collection not found.");
  const projectId = await getProjectScope(req, Model);
  const record = await Model.findOne({ _id: req.params.id, ...(projectId ? { projectId } : {}) });
  if (!record) throw httpError(404, "Record not found.");
  res.json({ success: true, data: respondData(record), message: "Record loaded." });
}

async function ensureApprovedRequirement(requirementId, projectId) {
  if (!requirementId) return;
  if (!mongoose.isValidObjectId(requirementId)) throw httpError(400, "A valid requirement id is required.");
  const requirement = await models.Requirement.findOne({ _id: requirementId, projectId });
  if (!requirement) throw httpError(404, "Linked requirement not found.");
  if (requirement.status !== "Approved") throw httpError(409, "Only approved requirements can be linked to activities or WBS nodes.");
}

async function ensureTeamMember(memberId, projectId, field) {
  if (!memberId) return;
  if (!mongoose.isValidObjectId(memberId)) throw httpError(400, `A valid ${field} id is required.`);
  const member = await models.TeamMember.findOne({ _id: memberId, projectId });
  if (!member) throw httpError(400, `${field} must belong to this project's team.`);
}

async function create(req, res) {
  const Model = registry[req.params.collection];
  if (!Model) throw httpError(404, "Collection not found.");
  const values = cleanBody(req.body);
  const projectId = await getProjectScope(req, Model);
  if (projectId) values.projectId = projectId;
  if (Model === models.Requirement && values.changeRequestId && !mongoose.isValidObjectId(values.changeRequestId)) {
    throw httpError(400, "changeRequestId must be a valid record id or null.");
  }
  if (Model === models.Activity) {
    await ensureApprovedRequirement(values.requirementId, projectId);
    await ensureTeamMember(values.assigneeId, projectId, "Activity assignee");
    await ensureAcyclic({ ...values, _id: new mongoose.Types.ObjectId() }, projectId);
  }
  if (Model === models.WbsNode) {
    if (values.type === "Project" && values.parentId) throw httpError(400, "A Project WBS node cannot have a parent.");
    if (values.type !== "Project" && !values.parentId) throw httpError(400, "Deliverable and WorkPackage nodes require a parent.");
    if (values.type === "WorkPackage" && !values.requirementId) throw httpError(400, "A WorkPackage must be linked to an approved requirement.");
    await ensureApprovedRequirement(values.requirementId, projectId);
    if (values.parentId) {
      const parent = await models.WbsNode.findOne({ _id: values.parentId, projectId });
      if (!parent) throw httpError(400, "WBS parent must belong to this project.");
      if (values.type === "Deliverable" && parent.type !== "Project") throw httpError(400, "A Deliverable must be nested under a Project node.");
      if (values.type === "WorkPackage" && parent.type !== "Deliverable") throw httpError(400, "A WorkPackage must be nested under a Deliverable node.");
    }
  }
  if (Model === models.Defect) await ensureTeamMember(values.assigneeId, projectId, "Defect assignee");
  if (Model === models.Inspection) await ensureTeamMember(values.testerId, projectId, "Inspection tester");
  if (Model === models.Requirement && values.changeRequestId) {
    const change = await models.ChangeRequest.findOne({ _id: values.changeRequestId, projectId });
    if (!change) throw httpError(400, "Linked change request must belong to this project.");
    if (values.status === "Approved" && change.status !== "Approved") throw httpError(409, "A requirement linked to a pending or rejected change request cannot be approved.");
  }
  if (Model === models.ChangeRequest && values.status === "Approved") {
    throw httpError(400, "Approve change requests through POST /api/change-requests/:id/approve.");
  }
  const record = await Model.create(values);
  if (Model === models.Requirement && record.status === "Approved") await generateWbs(projectId);
  res.status(201).json({ success: true, data: respondData(record), message: "Record created." });
}

async function update(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, "A valid record id is required.");
  const Model = registry[req.params.collection];
  if (!Model) throw httpError(404, "Collection not found.");
  const values = cleanBody(req.body);
  const projectId = await getProjectScope(req, Model);
  const record = await Model.findOne({ _id: req.params.id, ...(projectId ? { projectId } : {}) });
  if (!record) throw httpError(404, "Record not found.");
  const nextValues = { ...record.toObject(), ...values };
  if (Model === models.ChangeRequest && values.status === "Approved" && record.status !== "Approved") {
    throw httpError(400, "Approve change requests through POST /api/change-requests/:id/approve.");
  }
  if (Model === models.ChangeRequest && record.status === "Approved" && values.status && values.status !== "Approved") {
    throw httpError(409, "An approved change request cannot be reverted; submit a separate change request.");
  }
  if (Model === models.Requirement && values.status && values.status !== "Approved" &&
      (await models.Activity.exists({ projectId, requirementId: record._id }))) {
    throw httpError(409, "A requirement linked to an activity cannot be removed from approved scope.");
  }
  if (Model === models.Requirement && nextValues.changeRequestId) {
    const change = await models.ChangeRequest.findOne({ _id: nextValues.changeRequestId, projectId });
    if (!change) throw httpError(400, "Linked change request must belong to this project.");
    if (nextValues.status === "Approved" && change.status !== "Approved") throw httpError(409, "Approve the linked change request before approving this requirement.");
    if (change.status === "Approved" && nextValues.status !== "Approved") throw httpError(409, "A requirement in an approved change cannot be removed from approved scope.");
  }
  if (Model === models.Activity) {
    await ensureApprovedRequirement(nextValues.requirementId, projectId);
    await ensureTeamMember(nextValues.assigneeId, projectId, "Activity assignee");
    await ensureAcyclic({ ...nextValues, _id: record._id }, projectId, record._id);
  }
  if (Model === models.WbsNode) {
    await ensureApprovedRequirement(nextValues.requirementId, projectId);
    if (nextValues.type === "Project" && nextValues.parentId) throw httpError(400, "A Project WBS node cannot have a parent.");
    if (nextValues.type !== "Project" && !nextValues.parentId) throw httpError(400, "Deliverable and WorkPackage nodes require a parent.");
    if (nextValues.parentId) {
      const parent = await models.WbsNode.findOne({ _id: nextValues.parentId, projectId });
      if (!parent) throw httpError(400, "WBS parent must belong to this project.");
      if (nextValues.type === "Deliverable" && parent.type !== "Project") throw httpError(400, "A Deliverable must be nested under a Project node.");
      if (nextValues.type === "WorkPackage" && parent.type !== "Deliverable") throw httpError(400, "A WorkPackage must be nested under a Deliverable node.");
    }
  }
  if (Model === models.Defect) await ensureTeamMember(nextValues.assigneeId, projectId, "Defect assignee");
  if (Model === models.Inspection) await ensureTeamMember(nextValues.testerId, projectId, "Inspection tester");
  Object.assign(record, values);
  await record.save();
  if (Model === models.Requirement && values.status) await generateWbs(projectId);
  res.json({ success: true, data: respondData(record), message: "Record updated." });
}

async function remove(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, "A valid record id is required.");
  const Model = registry[req.params.collection];
  if (!Model) throw httpError(404, "Collection not found.");
  const projectId = await getProjectScope(req, Model);
  const record = await Model.findOne({ _id: req.params.id, ...(projectId ? { projectId } : {}) });
  if (!record) throw httpError(404, "Record not found.");
  if (Model === models.Requirement) {
    const [activity, node] = await Promise.all([
      models.Activity.exists({ projectId, requirementId: record._id }),
      models.WbsNode.exists({ projectId, requirementId: record._id })
    ]);
    const change = await models.ChangeRequest.exists({ projectId, requirementIds: record._id });
    if (activity || node || change) throw httpError(409, "This requirement is used by an activity, WBS node or change request and cannot be deleted.");
  }
  if (Model === models.WbsNode && await models.WbsNode.exists({ projectId, parentId: record._id })) {
    throw httpError(409, "Delete child WBS nodes before deleting their parent.");
  }
  if (Model === models.Activity && await models.Activity.exists({ projectId, predecessors: record._id })) {
    throw httpError(409, "This activity is a predecessor to other activities and cannot be deleted.");
  }
  if (Model === models.TeamMember) {
    const [activity, defect, inspection] = await Promise.all([
      models.Activity.exists({ projectId, assigneeId: record._id }),
      models.Defect.exists({ projectId, assigneeId: record._id }),
      models.Inspection.exists({ projectId, testerId: record._id })
    ]);
    if (activity || defect || inspection) throw httpError(409, "This team member is assigned to an activity, defect or inspection and cannot be deleted.");
  }
  await record.deleteOne();
  res.json({ success: true, data: { id: String(record._id) }, message: "Record deleted." });
}

module.exports = { list, getById, create, update, remove, respondData, httpError };
