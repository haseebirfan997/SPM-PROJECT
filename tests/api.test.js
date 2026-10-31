"use strict";

const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const { connectDatabase, disconnectDatabase } = require("../config/db");
const models = require("../models");
const { seedDatabase } = require("../services/seedService");
const { createApp } = require("../server");

jest.setTimeout(120000);
process.env.NODE_ENV = "test";
process.env.CPI_WARNING = "0.9";
process.env.CPI_CRITICAL = "0.8";
process.env.SPI_WARNING = "0.9";
process.env.SPI_CRITICAL = "0.8";

let mongo;
let app;
let projectId;
let project;
let team;
let requirements;
let activities;
const unique = (label) => `${label} ${Date.now()} ${Math.random().toString(16).slice(2, 7)}`;

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  await connectDatabase(mongo.getUri());
  await Promise.all(Object.values(models).map((Model) => Model.init()));
  ({ project, team, requirements, activities } = await seedDatabase());
  projectId = String(project._id);
  app = createApp();
});

afterAll(async () => {
  await disconnectDatabase();
  if (mongo) await mongo.stop();
});

const crudCases = [
  ["projects", () => ({
    title: unique("Test project"), objectives: ["Test objective"], stakeholders: [{ name: "Test stakeholder", role: "Sponsor" }],
    scopeIn: ["Appointments"], scopeOut: ["Diagnosis"], approvedBudget: 1000, originalBudget: 1000,
    startDate: "2025-01-01", deadline: "2025-02-01", originalDeadline: "2025-02-01", status: "Not Started"
  }), (record) => ({ title: unique("Updated project") })],
  ["milestones", () => ({ name: unique("Test milestone"), dueDate: "2025-01-10", projectId }), (record) => ({ name: unique("Updated milestone") })],
  ["teamMembers", () => ({ name: unique("Test member"), role: "Tester", responsibility: "Verify API", email: `${unique("person").replaceAll(" ", ".")}@example.test` }), (record) => ({ role: "Senior Tester" })],
  ["requirements", () => ({ title: unique("Test requirement"), description: "Test API requirement", priority: "Medium", status: "Proposed" }), (record) => ({ priority: "Low" })],
  ["wbsNodes", async () => {
    const rootNode = await models.WbsNode.findOne({ projectId, type: "Project" });
    return { name: unique("Test deliverable"), type: "Deliverable", parentId: String(rootNode._id) };
  }, () => ({ name: unique("Updated deliverable") })],
  ["changeRequests", () => ({ title: unique("Test change"), description: "Change for CRUD test", justification: "Test justification", costImpact: 1000, scheduleImpactWeeks: 1, status: "Pending", requirementIds: [] }), () => ({ costImpact: 2000 })],
  ["activities", () => ({
    name: unique("Test activity"), assigneeId: String(team[0]._id), durationDays: 2,
    startDate: "2025-01-01", endDate: "2025-01-02", percentComplete: 0, predecessors: [], plannedCost: 100, actualCost: 0
  }), () => ({ percentComplete: 10 })],
  ["defects", () => ({
    title: unique("Test defect"), module: "Appointment Scheduling", severity: "Low", assigneeId: String(team[0]._id),
    status: "Open", dateReported: "2025-01-02"
  }), () => ({ status: "In Progress" })],
  ["checklists", () => ({ deliverable: unique("Test checklist"), items: [{ text: "Verify payload", checked: false }] }), () => ({ items: [{ text: "Verify payload", checked: true }] })],
  ["inspections", () => ({
    deliverable: "API tests", testName: unique("Test inspection"), expected: "Pass", actual: "Pass", result: "Pass",
    date: "2025-01-02", testerId: String(team[6]._id)
  }), () => ({ result: "Fail" })],
  ["risks", () => ({ title: unique("Test risk"), description: "Risk description", likelihood: 2, impact: 3 }), () => ({ impact: 4 })],
  ["pdpcNodes", () => ({ type: "Objective", text: unique("Test objective") }), () => ({ text: unique("Updated objective") })],
  ["settings", () => ({ cpiWarning: .9, cpiCritical: .8, spiWarning: .9, spiCritical: .8, statusDate: "2025-01-02" }), () => ({ cpiWarning: .95 })]
];

describe.each(crudCases)("generic CRUD for %s", (collection, makeRecord, makeUpdate) => {
  test("creates, reads, updates and deletes a record", async () => {
    const targetProjectId = collection === "settings"
      ? String((await models.Project.create({
        title: unique("Settings CRUD project"), approvedBudget: 1000000, originalBudget: 1000000,
        startDate: "2025-01-01", deadline: "2025-04-23", originalDeadline: "2025-04-23"
      }))._id)
      : projectId;
    const payload = typeof makeRecord === "function" ? await makeRecord() : makeRecord;
    const created = await request(app).post(`/api/${collection}?projectId=${targetProjectId}`).send(payload);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ success: true, data: { id: expect.any(String) }, message: expect.any(String) });

    const fetched = await request(app).get(`/api/${collection}/${created.body.data.id}?projectId=${targetProjectId}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.id).toBe(created.body.data.id);

    const updated = await request(app).put(`/api/${collection}/${created.body.data.id}?projectId=${targetProjectId}`).send(makeUpdate(created.body.data));
    expect(updated.status).toBe(200);
    expect(updated.body.success).toBe(true);

    const removed = await request(app).delete(`/api/${collection}/${created.body.data.id}?projectId=${targetProjectId}`);
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ success: true, data: { id: created.body.data.id } });
  });
});

test("rejects invalid project dates, negative amounts and enumerations", async () => {
  const reversed = await request(app).post("/api/milestones").send({ name: unique("Bad date"), dueDate: "invalid" });
  expect(reversed.status).toBe(400);
  const negative = await request(app).post("/api/activities").send({
    name: unique("Negative duration"), durationDays: -1, startDate: "2025-01-01", endDate: "2025-01-01"
  });
  expect(negative.status).toBe(400);
  const invalidStatus = await request(app).post("/api/requirements").send({ title: unique("Bad status"), status: "In Review" });
  expect(invalidStatus.status).toBe(400);
});

test("returns 400 for malformed ids and 404 for unknown records", async () => {
  expect((await request(app).get("/api/risks/not-an-id")).status).toBe(400);
  expect((await request(app).get(`/api/risks/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
});

test("does not expose a proposed requirement in approved scope or generated WBS", async () => {
  const response = await request(app).get(`/api/scope/approved?projectId=${projectId}`);
  expect(response.status).toBe(200);
  expect(response.body.data.every((item) => item.status === "Approved")).toBe(true);
  expect(response.body.data.some((item) => item.title === "AI preliminary diagnosis")).toBe(false);
  const tree = await request(app).post(`/api/wbs/generate?projectId=${projectId}`).send({});
  expect(tree.status).toBe(200);
  expect(JSON.stringify(tree.body.data)).not.toContain("AI preliminary diagnosis");
});

test("rejects WBS and activity links to unapproved requirements and blocks used requirement deletion", async () => {
  const pendingRequirement = requirements.find((item) => item.status === "Proposed");
  const rootNode = await models.WbsNode.findOne({ projectId, type: "Project" });
  const deliverable = await models.WbsNode.findOne({ projectId, type: "Deliverable" });
  const workPackage = await request(app).post(`/api/wbsNodes?projectId=${projectId}`).send({
    name: unique("Pending work package"), type: "WorkPackage", parentId: String(deliverable._id), requirementId: String(pendingRequirement._id)
  });
  expect(workPackage.status).toBe(409);
  const activity = await request(app).post(`/api/activities?projectId=${projectId}`).send({
    name: unique("Pending activity"), assigneeId: String(team[0]._id), durationDays: 1,
    startDate: "2025-01-01", endDate: "2025-01-01", requirementId: String(pendingRequirement._id)
  });
  expect(activity.status).toBe(409);
  const used = requirements.find((item) => item.title === "Patient appointment booking");
  expect((await request(app).delete(`/api/requirements/${used._id}?projectId=${projectId}`)).status).toBe(409);
  expect(rootNode).toBeTruthy();
});

test("approval applies cost, three weeks, snapshots, approved scope and WBS atomically", async () => {
  const requirement = await models.Requirement.create({
    title: unique("AI expansion requirement"), description: "Approved AI diagnosis.", priority: "High", status: "Proposed", projectId
  });
  const change = await models.ChangeRequest.create({
    title: unique("AI expansion request"), description: "Add AI diagnosis.", justification: "Sponsor request.",
    costImpact: 800000, scheduleImpactWeeks: 3, status: "Pending", requirementIds: [requirement._id], projectId
  });
  const before = await models.Project.findById(projectId);
  const result = await request(app).post(`/api/change-requests/${change._id}/approve?projectId=${projectId}`).send({});
  expect(result.status).toBe(200);
  expect(result.body.data.before.budget).toBe(5000000);
  expect(result.body.data.after.budget).toBe(5800000);
  expect(result.body.data.before.durationWeeks).toBe(16);
  expect(result.body.data.after.durationWeeks).toBe(19);
  const afterProject = await models.Project.findById(projectId);
  expect(afterProject.deadline.getTime() - before.deadline.getTime()).toBe(21 * 86400000);
  expect((await models.Requirement.findById(requirement._id)).status).toBe("Approved");
  expect(await models.WbsNode.exists({ projectId, type: "WorkPackage", requirementId: requirement._id })).toBeTruthy();
  expect(result.body.data.changeRequest.status).toBe("Approved");
});

test("rejects change approval without impacts and keeps its linked requirement out of scope", async () => {
  const requirement = await models.Requirement.create({ title: unique("No impact requirement"), projectId });
  const change = await models.ChangeRequest.create({
    title: unique("Missing impact request"), costImpact: 0, scheduleImpactWeeks: 0,
    requirementIds: [requirement._id], projectId
  });
  await models.ChangeRequest.updateOne({ _id: change._id }, { $unset: { costImpact: 1, scheduleImpactWeeks: 1 } });
  const approval = await request(app).post(`/api/change-requests/${change._id}/approve?projectId=${projectId}`).send({});
  expect(approval.status).toBe(400);
  await request(app).post(`/api/change-requests/${change._id}/reject?projectId=${projectId}`).send({});
  expect((await models.Requirement.findById(requirement._id)).status).toBe("Proposed");
});

test("rejects a circular dependency on create and update", async () => {
  const first = await models.Activity.findById(activities[0]._id);
  const second = await request(app).post(`/api/activities?projectId=${projectId}`).send({
    name: unique("Cycle node"), assigneeId: String(team[0]._id), durationDays: 1,
    startDate: "2025-01-01", endDate: "2025-01-01", predecessors: [String(first._id)]
  });
  expect(second.status).toBe(201);
  const cycle = await request(app).put(`/api/activities/${first._id}?projectId=${projectId}`).send({
    predecessors: [second.body.data.id]
  });
  expect(cycle.status).toBe(400);
  expect(cycle.body.message).toMatch(/Circular/);
});

test("schedule endpoint returns forward pass, critical path and slack", async () => {
  const response = await request(app).get(`/api/schedule?projectId=${projectId}`);
  expect(response.status).toBe(200);
  expect(response.body.data.activities.length).toBeGreaterThanOrEqual(15);
  expect(response.body.data.criticalPath.length).toBeGreaterThan(0);
  expect(response.body.data.activities.every((item) => item.slackDays >= 0 && item.earliestFinish >= item.earliestStart)).toBe(true);
});

test("delay analysis propagates delay into dependent activities and reports deadline impact", async () => {
  const response = await request(app).get(`/api/schedule/delays?projectId=${projectId}&statusDate=2026-10-25`);
  expect(response.status).toBe(200);
  const items = response.body.data.allActivities;
  const delayed = items.find((item) => item.id === String(activities[4]._id));
  const dependent = items.find((item) => item.id === String(activities[5]._id));
  expect(delayed.delayDays).toBeGreaterThan(0);
  expect(dependent.propagatedDelayDays).toBeGreaterThanOrEqual(delayed.propagatedDelayDays);
  expect(response.body.data.finalDeadlineImpactDays).toEqual(expect.any(Number));
});

test("EVM endpoint computes PV, EV, AC, indices, variances and estimates for known inputs", async () => {
  const start = new Date("2025-01-01T00:00:00.000Z");
  const endDate = new Date("2025-01-10T00:00:00.000Z");
  const isolatedProject = await models.Project.create({
    title: unique("EVM project"), objectives: ["EVM test"], approvedBudget: 1000, originalBudget: 1000,
    startDate: start, deadline: new Date("2025-01-20T00:00:00.000Z"), originalDeadline: new Date("2025-01-20T00:00:00.000Z")
  });
  await models.Activity.create({
    name: unique("Known EVM activity"), projectId: isolatedProject._id, durationDays: 10,
    startDate: start, endDate, percentComplete: 50, plannedCost: 1000, actualCost: 250
  });
  const result = await request(app).get(`/api/evm?projectId=${isolatedProject._id}&statusDate=2025-01-05`);
  expect(result.status).toBe(200);
  expect(result.body.data).toMatchObject({ BAC: 1000, PV: 500, EV: 500, AC: 250, CPI: 2, SPI: 1, CV: 250, SV: 0, EAC: 500, ETC: 250, VAC: 500 });
  const perActivity = await request(app).get(`/api/evm/by-activity?projectId=${isolatedProject._id}&statusDate=2025-01-05`);
  expect(perActivity.body.data[0]).toMatchObject({ PV: 500, EV: 500, AC: 250 });
});

test("EVM applies critical threshold warnings", async () => {
  const start = new Date("2025-01-01T00:00:00.000Z");
  const isolatedProject = await models.Project.create({
    title: unique("EVM warning project"), approvedBudget: 1000, originalBudget: 1000,
    startDate: start, deadline: new Date("2025-01-20T00:00:00.000Z"), originalDeadline: new Date("2025-01-20T00:00:00.000Z")
  });
  await models.Activity.create({
    name: unique("Critical CPI activity"), projectId: isolatedProject._id, durationDays: 10, startDate: start,
    endDate: new Date("2025-01-10T00:00:00.000Z"), percentComplete: 50, plannedCost: 1000, actualCost: 1000
  });
  const result = await request(app).get(`/api/evm?projectId=${isolatedProject._id}&statusDate=2025-01-05`);
  expect(result.body.data.CPI).toBe(.5);
  expect(result.body.data.warnings.some((warning) => warning.severity === "red" && warning.metric === "CPI")).toBe(true);
});

test("ranked risks and matrix return score order and all 25 cells", async () => {
  const ranked = await request(app).get(`/api/risks/ranked?projectId=${projectId}`);
  expect(ranked.status).toBe(200);
  expect(ranked.body.data[0].score).toBe(25);
  expect(ranked.body.data[0].rank).toBe(1);
  const matrix = await request(app).get(`/api/risks/matrix?projectId=${projectId}`);
  expect(matrix.body.data.grid.flat()).toHaveLength(25);
  expect(matrix.body.data.grid.flat().reduce((sum, cell) => sum + cell.count, 0)).toBe(7);
});

test("consistency service identifies an invalid assignee and unapproved requirement link", async () => {
  const proposed = requirements.find((item) => item.status === "Proposed");
  await models.Activity.create({
    name: unique("Inconsistent activity"), projectId, durationDays: 1, startDate: new Date("2025-01-01"),
    endDate: new Date("2025-01-01"), assigneeId: new mongoose.Types.ObjectId(), requirementId: proposed._id
  });
  const result = await request(app).get(`/api/consistency?projectId=${projectId}`);
  expect(result.status).toBe(200);
  expect(result.body.data.some((item) => item.code === "activity-assignee")).toBe(true);
  expect(result.body.data.some((item) => item.code === "activity-requirement")).toBe(true);
});

test("dashboard returns weighted progress and project summary aggregates", async () => {
  const response = await request(app).get(`/api/dashboard?projectId=${projectId}`);
  expect(response.status).toBe(200);
  expect(response.body.data.overallProgress).toBeGreaterThan(0);
  expect(response.body.data.budget).toMatchObject({ approved: 5800000, planned: 5000000 });
  expect(response.body.data.pendingChangeRequests).toBeGreaterThanOrEqual(2);
  expect(response.body.data.topRisks).toHaveLength(5);
  expect(response.body.data.unresolvedCriticalDefects).toBe(2);
});

test("PDPC tree, defect summary and full report endpoints return nested aggregates", async () => {
  const [tree, defects, report] = await Promise.all([
    request(app).get(`/api/pdpc/tree?projectId=${projectId}`),
    request(app).get(`/api/defects/summary?projectId=${projectId}`),
    request(app).get(`/api/report?projectId=${projectId}`)
  ]);
  expect(tree.body.data[0].type).toBe("Objective");
  expect(tree.body.data[0].children[0].children[0].children[0].type).toBe("Corrective");
  expect(defects.body.data.unresolvedCritical).toBe(2);
  expect(report.body.data).toHaveProperty("project");
  expect(report.body.data).toHaveProperty("consistency");
});

test("serves frontend static files and consistent health responses", async () => {
  expect((await request(app).get("/")).status).toBe(200);
  expect((await request(app).get("/js/api.js")).status).toBe(200);
  expect((await request(app).get("/api/health")).body).toMatchObject({ success: true, data: { status: "ok" } });
});

test("returns the standard JSON 404 and validation error formats", async () => {
  const missing = await request(app).get("/api/no-such-endpoint");
  expect(missing.status).toBe(404);
  expect(missing.body).toMatchObject({ success: false, message: expect.any(String), errors: expect.any(Array) });
  const invalid = await request(app).post("/api/requirements").send({ priority: "Urgent" });
  expect(invalid.status).toBe(400);
  expect(invalid.body).toMatchObject({ success: false, message: expect.any(String), errors: expect.any(Array) });
});
