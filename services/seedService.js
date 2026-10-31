"use strict";

const mongoose = require("mongoose");
const models = require("../models");
const { generateWbs } = require("./scopeService");

function dateAt(start, days) {
  return new Date(start.getTime() + days * 86400000);
}

async function seedDatabase() {
  const projectTitle = "Smart Healthcare Project Management and Monitoring System";
  const existingProject = await models.Project.findOne({ title: projectTitle });
  if (existingProject) {
    const relatedModels = Object.values(models).filter((Model) => Model !== models.Project);
    await Promise.all(relatedModels.map((Model) => Model.deleteMany({ projectId: existingProject._id })));
    await existingProject.deleteOne();
  }
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const start = dateAt(now, -42);
  const deadline = dateAt(start, 112);
  const project = await models.Project.create({
    title: projectTitle,
    objectives: [
      "Deliver a Smart Healthcare Project Management System for a network of five hospitals, covering patient appointments, laboratory reports, doctor schedules, online consultations and hospital billing.",
      "Complete the 16-week baseline within the maximum approved budget of PKR 5,000,000, managing additional requests through formal change control."
    ],
    stakeholders: [
      { name: "Ayesha Khan", role: "Project Manager" },
      { name: "Hospital Steering Committee", role: "Sponsor" },
      { name: "Clinical Operations Leads", role: "Clinical stakeholders" },
      { name: "Hospital IT Directors", role: "Technical stakeholders" },
      { name: "Patients and Care Teams", role: "End users" }
    ],
    scopeIn: [
      "Patient appointments", "Patient records", "Laboratory reports", "Doctor schedules",
      "Online consultations", "Hospital billing", "Five-hospital administration",
      "Role-based access", "Operational reporting"
    ],
    scopeOut: ["Clinical diagnosis decisions", "Replacement of hospital EHR systems", "Unapproved integrations"],
    approvedBudget: 5000000, originalBudget: 5000000,
    startDate: start, deadline, originalDeadline: deadline, status: "In Progress",
    plan: {
      scope: "Ten approved requirements across five hospitals; route new requests through sponsor-approved change control.",
      schedule: "Sixteen-week baseline. The two pending scope changes add three estimated weeks; extend the deadline only after approval.",
      cost: "PKR 5,000,000 maximum approved baseline. Pending AI and mobile changes add PKR 800,000 in estimated cost and require approval before budget re-baselining.",
      quality: "Prioritize critical appointment-scheduling and patient-record defects, with regression testing, patient-data security checks and documented user acceptance."
    }
  });
  const projectId = project._id;
  const teamInfo = [
    ["Ayesha Khan", "Project Manager", "Delivery governance, stakeholders and approvals", "ayesha.khan@careflow.example"],
    ["Omar Siddiqui", "Backend Developer", "Appointments, consultations and service APIs", "omar.siddiqui@careflow.example"],
    ["Sara Ahmed", "Backend Developer", "Patient records, laboratory and billing services", "sara.ahmed@careflow.example"],
    ["Hamza Raza", "Frontend Developer", "Hospital staff portal and scheduling experience", "hamza.raza@careflow.example"],
    ["Noor Ali", "Frontend Developer", "Patient portal and responsive application", "noor.ali@careflow.example"],
    ["Bilal Hussain", "Database Developer", "Data model, migration and performance", "bilal.hussain@careflow.example"],
    ["Mariam Iqbal", "QA Engineer", "Test strategy, execution and defect verification", "mariam.iqbal@careflow.example"]
  ];
  const team = await models.TeamMember.insertMany(teamInfo.map(([name, role, responsibility, email]) =>
    ({ name, role, responsibility, email, projectId })));
  const member = Object.fromEntries(team.map((person) => [person.role + ":" + person.name.split(" ")[0], person._id]));
  const requirementsInfo = [
    ["Patient appointment booking", "Search availability and book, reschedule or cancel appointments.", "High", "Approved"],
    ["Doctor schedule management", "Hospital staff publish and maintain doctor availability.", "High", "Approved"],
    ["Patient record management", "Authorized care teams view and update a unified patient record.", "High", "Approved"],
    ["Laboratory report access", "Patients and clinicians securely view laboratory reports.", "High", "Approved"],
    ["Online consultations", "Patients schedule and attend remote consultations.", "High", "Approved"],
    ["Hospital billing", "Calculate hospital charges and record payments.", "High", "Approved"],
    ["Five-hospital administration", "Manage staff, services and operating details for each hospital.", "Medium", "Approved"],
    ["Patient notifications", "Send appointment and laboratory status updates.", "Medium", "Approved"],
    ["Role-based access", "Control patient-data access using clinical and administrative roles.", "High", "Approved"],
    ["Operational reporting", "Review service volume and hospital operating performance.", "Medium", "Approved"],
    ["AI preliminary diagnosis", "Provide an AI-assisted preliminary diagnosis for clinician review.", "High", "Proposed"],
    ["Healthcare mobile app", "Provide mobile access to appointments, reports and consultations.", "Medium", "Proposed"]
  ];
  const requirements = await models.Requirement.insertMany(requirementsInfo.map(([title, description, priority, status]) =>
    ({ title, description, priority, status, projectId })));
  const req = Object.fromEntries(requirements.map((item) => [item.title, item._id]));
  const aiChangeId = new mongoose.Types.ObjectId();
  const mobileChangeId = new mongoose.Types.ObjectId();
  await models.Requirement.updateOne({ _id: req["AI preliminary diagnosis"] }, { $set: { changeRequestId: aiChangeId } });
  await models.Requirement.updateOne({ _id: req["Healthcare mobile app"] }, { $set: { changeRequestId: mobileChangeId } });
  await models.ChangeRequest.insertMany([
    {
      _id: aiChangeId, title: "AI-based preliminary diagnosis", description: "Add a clinician-reviewed AI preliminary diagnosis module.",
      justification: "Hospital stakeholders requested earlier triage support.", costImpact: 500000,
      scheduleImpactWeeks: 2, status: "Pending", requirementIds: [req["AI preliminary diagnosis"]], projectId
    },
    {
      _id: mobileChangeId, title: "Patient mobile application", description: "Add mobile access to patient appointments, reports and consultations.",
      justification: "Improve patient access across the five-hospital network.", costImpact: 300000,
      scheduleImpactWeeks: 1, status: "Pending", requirementIds: [req["Healthcare mobile app"]], projectId
    }
  ]);
  const activityInfo = [
    ["Requirements workshops", 7, 0, 100, [], 230000, null, "Project Manager:Ayesha"],
    ["Architecture and data design", 10, 7, 100, [0], 420000, null, "Backend Developer:Sara"],
    ["Hospital and role configuration", 8, 12, 100, [0], 260000, null, "Frontend Developer:Noor"],
    ["Patient record services", 15, 17, 75, [1], 580000, "Patient record management", "Backend Developer:Sara"],
    ["Appointment scheduling services", 14, 20, 58, [1], 570000, "Patient appointment booking", "Backend Developer:Omar"],
    ["Doctor schedule portal", 12, 23, 70, [2, 4], 390000, "Doctor schedule management", "Frontend Developer:Hamza"],
    ["Laboratory report integration", 12, 28, 45, [3], 400000, "Laboratory report access", "Backend Developer:Sara"],
    ["Online consultation workflow", 14, 31, 35, [4], 450000, "Online consultations", "Backend Developer:Omar"],
    ["Billing and payment workflow", 12, 33, 55, [3], 410000, "Hospital billing", "Backend Developer:Sara"],
    ["Patient web portal", 14, 36, 30, [4, 6], 430000, "Patient appointment booking", "Frontend Developer:Hamza"],
    ["Reporting and notifications", 10, 42, 20, [5, 8], 300000, "Operational reporting", "Database Developer:Bilal"],
    ["Integration and system testing", 14, 49, 0, [7, 9, 10], 300000, null, "QA Engineer:Mariam"],
    ["Security and performance testing", 8, 63, 0, [11], 100000, null, "QA Engineer:Mariam"],
    ["User acceptance and training", 8, 71, 0, [12], 70000, null, "Frontend Developer:Noor"],
    ["Five-hospital rollout", 7, 79, 0, [13], 90000, null, "Project Manager:Ayesha"]
  ];
  const activities = [];
  for (const [index, row] of activityInfo.entries()) {
    const [name, durationDays, offset, percentComplete, predecessorIndexes, plannedCost, requirementTitle, assigneeKey] = row;
    const activityStart = dateAt(start, offset);
    activities.push(await models.Activity.create({
      name, durationDays, startDate: activityStart, endDate: dateAt(activityStart, durationDays - 1),
      percentComplete, predecessors: predecessorIndexes.map((previous) => activities[previous]._id),
      plannedCost, actualCost: Math.round(plannedCost * percentComplete / 100 * (index === 4 ? 1.18 : 1.02)),
      requirementId: requirementTitle ? req[requirementTitle] : null, assigneeId: member[assigneeKey], projectId
    }));
  }
  const milestoneInfo = [
    ["Requirements baseline", 14, "Completed"],
    ["Architecture sign-off", 28, "Completed"],
    ["Core workflows ready", 63, "In Progress"],
    ["System acceptance testing", 98, "Not Started"],
    ["Five-hospital rollout", 112, "Not Started"]
  ];
  await models.Milestone.insertMany(milestoneInfo.map(([name, offset, status]) =>
    ({ name, dueDate: dateAt(start, offset), status, projectId })));
  const today = now;
  await models.Defect.insertMany([
    ["Overlapping bookings accepted for the same doctor", "Appointment Scheduling", "Critical", "Backend Developer:Omar", "Open", -3],
    ["Patient record update overwrites an existing allergy", "Patient Records", "Critical", "Backend Developer:Sara", "In Progress", -2],
    ["Rescheduled appointment retains the old reminder time", "Appointment Scheduling", "High", "Frontend Developer:Hamza", "Open", -6],
    ["Laboratory report upload accepts unsupported file type", "Laboratory Reports", "High", "Backend Developer:Sara", "In Progress", -5],
    ["Doctor availability shows stale slot after cancellation", "Doctor Schedules", "Medium", "Frontend Developer:Hamza", "Open", -4],
    ["Consultation session lacks connection retry guidance", "Online Consultations", "Medium", "Frontend Developer:Noor", "Resolved", -8],
    ["Invoice total is rounded inconsistently", "Hospital Billing", "Low", "Backend Developer:Omar", "Open", -1]
  ].map(([title, module, severity, assigneeKey, status, offset]) => ({
    title, module, severity, assigneeId: member[assigneeKey], status, dateReported: dateAt(today, offset),
    resolvedDate: status === "Resolved" ? today : null, projectId
  })));
  await models.Checklist.insertMany([
    { deliverable: "Appointment Scheduling", items: [
      { text: "Prevent conflicting doctor bookings", checked: false },
      { text: "Verify booking, cancellation and rescheduling", checked: true },
      { text: "Confirm role permissions and audit history", checked: false },
      { text: "Verify appointment reminders use current schedule", checked: false }
    ], projectId },
    { deliverable: "Patient Records", items: [
      { text: "Validate patient identity and record matching", checked: true },
      { text: "Verify allergy and medication update integrity", checked: false },
      { text: "Confirm access controls and audit events", checked: false },
      { text: "Test record backup and recovery", checked: false }
    ], projectId }
  ]);
  await models.Inspection.insertMany([
    { deliverable: "Appointment Scheduling", testName: "Booking conflict regression", expected: "A doctor cannot be double-booked.", actual: "Overlapping slots are accepted in a concurrent booking test.", result: "Fail", date: today, testerId: member["QA Engineer:Mariam"], projectId },
    { deliverable: "Patient Records", testName: "Allergy record update", expected: "Existing allergy data remains intact after edits.", actual: "An update can replace an existing allergy entry.", result: "Fail", date: today, testerId: member["QA Engineer:Mariam"], projectId }
  ]);
  await models.Risk.insertMany([
    ["Appointment defects delay system acceptance", 5, 5, "Run focused scheduling regression and protect stabilization time.", "Escalate critical defects and defer nonessential scope if acceptance is at risk."],
    ["Patient record integrity during migration", 4, 5, "Rehearse migration with reconciliation and audit checks.", "Pause cutover and restore the verified backup."],
    ["Hospital integration readiness varies", 4, 4, "Confirm interface owners and test windows with each hospital.", "Use a staged rollout and documented manual handoff."],
    ["Clinical stakeholders unavailable for acceptance", 3, 4, "Book representative review sessions in advance.", "Escalate a named delegate and re-sequence acceptance tests."],
    ["Scope expansion exceeds approved capacity", 3, 5, "Route new requests through impact assessment and approval.", "Rebaseline budget and deadline before committing delivery."],
    ["Sensitive patient data exposed through access gaps", 2, 5, "Verify role permissions and audit events during security testing.", "Revoke affected access, investigate and follow hospital incident procedures."],
    ["Laboratory interface data arrives late", 3, 3, "Validate sample payloads and agree interface dates early.", "Use controlled test data while the interface is restored."]
  ].map(([title, likelihood, impact, description, response]) => ({
    title, likelihood, impact, description: `${description} Contingency: ${response}`, projectId
  })));
  const objective = await models.PdpcNode.create({ type: "Objective", text: "Safely launch appointment scheduling across all five hospitals", projectId });
  const riskNode = await models.PdpcNode.create({ type: "Risk", text: "Conflicting bookings or incomplete doctor availability at rollout", parentId: objective._id, projectId });
  const preventive = await models.PdpcNode.create({ type: "Preventive", text: "Run concurrency tests, reconcile schedule imports and pilot at one hospital.", parentId: riskNode._id, projectId });
  await models.PdpcNode.create({ type: "Corrective", text: "Pause hospital activation, restore the verified schedule and use the approved manual workflow.", parentId: preventive._id, projectId });
  await models.Settings.create({
    cpiWarning: Number(process.env.CPI_WARNING || 0.9),
    cpiCritical: Number(process.env.CPI_CRITICAL || 0.8),
    spiWarning: Number(process.env.SPI_WARNING || 0.9),
    spiCritical: Number(process.env.SPI_CRITICAL || 0.8),
    statusDate: today, projectId
  });
  await generateWbs(projectId);
  return { project, team, requirements, activities };
}

module.exports = { seedDatabase };
