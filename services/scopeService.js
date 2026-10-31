"use strict";

const mongoose = require("mongoose");
const { Project, Requirement, WbsNode, ChangeRequest } = require("../models");
const { getProject } = require("./projectService");

const DAY = 86400000;
const weeksBetween = (start, end) => Math.max(0, Math.round((new Date(end) - new Date(start)) / (7 * DAY)));
const plusWeeks = (date, weeks) => new Date(new Date(date).getTime() + Number(weeks) * 7 * DAY);
const deliverableFor = (title) => {
  if (/appointment|patient|consultation|mobile/i.test(title)) return "Patient care services";
  if (/doctor|laboratory|diagnosis/i.test(title)) return "Clinical operations";
  if (/billing|hospital/i.test(title)) return "Hospital administration";
  return "Platform & insights";
};

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

async function createWorkPackage(requirement, projectId, session) {
  const withSession = (query) => session ? query.session(session) : query;
  const options = session ? { session } : {};
  const rootNode = await withSession(WbsNode.findOne({ projectId, type: "Project", parentId: null }));
  if (!rootNode) {
    const [createdRoot] = await WbsNode.create([{
      projectId, name: "Smart Healthcare Project Management and Monitoring System",
      type: "Project", parentId: null, requirementId: null
    }], options);
    const [deliverable] = await WbsNode.create([{
      projectId, name: deliverableFor(requirement.title), type: "Deliverable", parentId: createdRoot._id, requirementId: null
    }], options);
    await WbsNode.create([{
      projectId, name: requirement.title, type: "WorkPackage", parentId: deliverable._id, requirementId: requirement._id
    }], options);
    return;
  }
  let deliverable = await withSession(WbsNode.findOne({
    projectId, parentId: rootNode._id, type: "Deliverable", name: deliverableFor(requirement.title)
  }));
  if (!deliverable) {
    [deliverable] = await WbsNode.create([{
      projectId, name: deliverableFor(requirement.title), type: "Deliverable", parentId: rootNode._id, requirementId: null
    }], options);
  }
  const existing = await withSession(WbsNode.findOne({ projectId, type: "WorkPackage", requirementId: requirement._id }));
  if (!existing) {
    await WbsNode.create([{
      projectId, name: requirement.title, type: "WorkPackage", parentId: deliverable._id, requirementId: requirement._id
    }], options);
  }
}

async function approveChangeRequest(id, projectId) {
  let summary;
  const apply = async (session) => {
    const project = await getProject(projectId, session);
    const requestQuery = ChangeRequest.findById(id);
    if (session) requestQuery.session(session);
    const changeRequest = await requestQuery;
    if (!changeRequest) {
      const error = new Error("Change request not found.");
      error.status = 404;
      throw error;
    }
    if (String(changeRequest.projectId) !== String(project._id)) throw conflict("Change request does not belong to this project.");
    if (changeRequest.status !== "Pending") throw conflict("Only pending change requests can be approved.");
    if (changeRequest.costImpact == null || changeRequest.scheduleImpactWeeks == null) {
      const error = new Error("Cost impact and schedule impact are required before approval.");
      error.status = 400;
      throw error;
    }
    if (!changeRequest.requirementIds.length) throw conflict("Link at least one requirement before approving this change request.");
    const requirementQuery = Requirement.find({
      _id: { $in: changeRequest.requirementIds }, projectId: project._id
    });
    if (session) requirementQuery.session(session);
    const requirements = await requirementQuery;
    if (requirements.length !== changeRequest.requirementIds.length) throw conflict("One or more linked requirements are missing.");
    const before = {
      budget: project.approvedBudget,
      deadline: project.deadline,
      durationWeeks: weeksBetween(project.startDate, project.deadline)
    };
    project.approvedBudget += changeRequest.costImpact;
    project.deadline = plusWeeks(project.deadline, changeRequest.scheduleImpactWeeks);
    await project.save(session ? { session } : undefined);
    await Requirement.updateMany(
      { _id: { $in: changeRequest.requirementIds }, projectId: project._id },
      { $set: { status: "Approved" } },
      session ? { session, runValidators: true } : { runValidators: true }
    );
    for (const requirement of requirements) await createWorkPackage(requirement, project._id, session);
    const after = {
      budget: project.approvedBudget,
      deadline: project.deadline,
      durationWeeks: weeksBetween(project.startDate, project.deadline)
    };
    changeRequest.status = "Approved";
    changeRequest.decisionDate = new Date();
    changeRequest.before = before;
    changeRequest.after = after;
    await changeRequest.save(session ? { session } : undefined);
    summary = { request: changeRequest, before, after, project };
  };
  const topology = mongoose.connection.client && mongoose.connection.client.topology;
  const topologyType = topology && topology.description && topology.description.type;
  if (topologyType && topologyType !== "Single" && topologyType !== "Unknown") {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(() => apply(session));
    } finally {
      await session.endSession();
    }
  } else {
    await apply(null);
  }
  return summary;
}

async function rejectChangeRequest(id, projectId) {
  const project = await getProject(projectId);
  const request = await ChangeRequest.findById(id);
  if (!request) {
    const error = new Error("Change request not found.");
    error.status = 404;
    throw error;
  }
  if (!request.projectId.equals(project._id)) throw conflict("Change request does not belong to this project.");
  if (request.status !== "Pending") throw conflict("Only pending change requests can be rejected.");
  request.status = "Rejected";
  request.decisionDate = new Date();
  await request.save();
  return request;
}

async function approvedScope(projectId) {
  const project = await getProject(projectId);
  const requirements = await Requirement.find({ projectId: project._id, status: "Approved" }).sort({ title: 1 });
  return requirements;
}

async function generateWbs(projectId) {
  const project = await getProject(projectId);
  const approved = await Requirement.find({ projectId: project._id, status: "Approved" }).sort({ title: 1 });
  const existingRoot = await WbsNode.findOne({ projectId: project._id, type: "Project", parentId: null });
  const keepIds = approved.map((requirement) => requirement._id);
  await WbsNode.deleteMany({
    projectId: project._id, type: "WorkPackage", requirementId: { $nin: keepIds }
  });
  if (!existingRoot) {
    await WbsNode.create({
      projectId: project._id, name: project.title, type: "Project", parentId: null, requirementId: null
    });
  } else if (existingRoot.name !== project.title) {
    existingRoot.name = project.title;
    await existingRoot.save();
  }
  const desired = new Set(approved.map((requirement) => deliverableFor(requirement.title)));
  await WbsNode.deleteMany({
    projectId: project._id, type: "Deliverable", name: { $nin: Array.from(desired) }
  });
  for (const requirement of approved) await createWorkPackage(requirement, project._id, null);
  return getWbsTree(project._id);
}

async function getWbsTree(projectId) {
  const project = await getProject(projectId);
  const [nodes, approvedIds] = await Promise.all([
    WbsNode.find({ projectId: project._id }).sort({ createdAt: 1 }).lean(),
    Requirement.find({ projectId: project._id, status: "Approved" }).distinct("_id")
  ]);
  const allowed = new Set(approvedIds.map(String));
  const mapped = new Map();
  nodes.forEach((node) => {
    if (node.type === "WorkPackage" && (!node.requirementId || !allowed.has(String(node.requirementId)))) return;
    mapped.set(String(node._id), { ...node, id: String(node._id), children: [] });
  });
  const roots = [];
  mapped.forEach((node) => {
    const parent = node.parentId && mapped.get(String(node.parentId));
    if (parent) parent.children.push(node);
    else if (node.type === "Project") roots.push(node);
  });
  return roots;
}

module.exports = { approveChangeRequest, rejectChangeRequest, approvedScope, generateWbs, getWbsTree, deliverableFor };
