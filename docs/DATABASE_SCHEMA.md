# Database schema and API reference

MongoDB collections use Mongoose timestamps (`createdAt`, `updatedAt`) and an ObjectId `_id`, serialized by the API as `id`. Records other than a project are scoped by a required `projectId` reference. API responses use `{ "success": true, "data": ..., "message": "..." }`; errors use `{ "success": false, "message": "...", "errors": [] }`.

## Collections and relationships

| API collection | Model / collection | Fields and types | References, validation and indexes |
|---|---|---|---|
| `projects` | `Project` / `projects` | `title: String`; `objectives: String[]`; `stakeholders: {name: String, role: String}[]`; `scopeIn: String[]`; `scopeOut: String[]`; `approvedBudget`, `originalBudget: Number >= 0`; `startDate`, `deadline`, `originalDeadline: Date`; `status: Not Started \| In Progress \| On Hold \| Completed`; `plan: {scope, schedule, cost, quality: String}`; `closure: {lessonsLearned: String, finalCost: Number >= 0, completionDate: Date, signOff: Pending \| Approved \| Rejected} \| null` | Unique project title. Deadline and original deadline must not precede start date. |
| `milestones` | `Milestone` / `milestones` | `name: String`; `dueDate: Date`; `status: Not Started \| In Progress \| Completed`; `projectId: ObjectId` | Unique name within project; references `Project`. |
| `teamMembers` | `TeamMember` / `teammembers` | `name`, `role`, `responsibility`, `email: String`; `projectId: ObjectId` | Unique name and nonempty email within project; references `Project`. |
| `requirements` | `Requirement` / `requirements` | `title`, `description: String`; `priority: High \| Medium \| Low`; `status: Proposed \| Approved \| Rejected`; `changeRequestId: ObjectId \| null`; `projectId: ObjectId` | Unique title within project; optional `ChangeRequest` reference; approved-scope operations check change approval. |
| `wbsNodes` | `WbsNode` / `wbsnodes` | `name: String`; `type: Project \| Deliverable \| WorkPackage`; `parentId: ObjectId \| null`; `requirementId: ObjectId \| null`; `projectId: ObjectId` | Self-reference `parentId`; optional `Requirement` reference; unique project/parent/name; work packages require an approved requirement and valid parent level. |
| `changeRequests` | `ChangeRequest` / `changerequests` | `title`, `description`, `justification: String`; `costImpact`, `scheduleImpactWeeks: Number >= 0`; `status: Pending \| Approved \| Rejected`; `requirementIds: ObjectId[]`; `decisionDate: Date \| null`; `before`, `after: {budget: Number, deadline: Date, durationWeeks: Number}`; `projectId: ObjectId` | Unique title within project; references `Project` and linked `Requirement` records. Approval is available only through the approval endpoint. |
| `activities` | `Activity` / `activities` | `name: String`; `assigneeId: ObjectId \| null`; `durationDays: Number >= 0`; `startDate`, `endDate: Date`; `percentComplete: Number (0–100)`; `predecessors: ObjectId[]`; `plannedCost`, `actualCost: Number >= 0`; `requirementId: ObjectId \| null`; `isMilestone: Boolean`; `projectId: ObjectId` | References `TeamMember`, predecessor `Activity` records, optional `Requirement`, and `Project`. End date cannot precede start date; self/circular dependencies are rejected; linked requirements must be approved. |
| `defects` | `Defect` / `defects` | `title`, `module: String`; `severity: Critical \| High \| Medium \| Low`; `assigneeId: ObjectId \| null`; `status: Open \| In Progress \| Resolved \| Closed`; `dateReported: Date`; `resolvedDate: Date \| null`; `projectId: ObjectId` | References `TeamMember` and `Project`; titles unique within project. |
| `checklists` | `Checklist` / `checklists` | `deliverable: String`; `items: {text: String, checked: Boolean}[]`; `projectId: ObjectId` | Unique deliverable within project; embedded checklist items have their own MongoDB subdocument ids. |
| `inspections` | `Inspection` / `inspections` | `deliverable`, `testName`, `expected`, `actual: String`; `result: Pass \| Fail`; `date: Date`; `testerId: ObjectId \| null`; `projectId: ObjectId` | References `TeamMember` as tester and `Project`. |
| `risks` | `Risk` / `risks` | `title`, `description: String`; `likelihood`, `impact: Integer (1–5)`; `score: Integer (1–25, calculated before validation)`; `projectId: ObjectId` | Unique title within project; indexed by project and descending score; references `Project`. |
| `pdpcNodes` | `PdpcNode` / `pdpcnodes` | `type: Objective \| Risk \| Preventive \| Corrective`; `text: String`; `parentId: ObjectId \| null`; `projectId: ObjectId` | Self-reference builds the objective → risk → preventive → corrective tree; references `Project`. |
| `settings` | `Settings` / `settings` | `cpiWarning`, `cpiCritical`, `spiWarning`, `spiCritical: Number >= 0`; `statusDate: Date`; `projectId: ObjectId` | Critical EVM thresholds must be below warning thresholds; references `Project`. |

## Indexes

All documents use timestamps. Besides the unique project-scoped name indexes listed above, project status, requirement/change status, WBS parent, PDPC parent, and risk rank queries are indexed. MongoDB ObjectId references provide relational links; the consistency endpoint checks cross-document assignments and scope integrity.

## API routes

### Generic CRUD

For every collection listed above:

- `GET /api/:collection` — list records (optionally `?projectId=<id>`).
- `GET /api/:collection/:id` — fetch one record.
- `POST /api/:collection` — validate and create.
- `PUT /api/:collection/:id` — validate and update.
- `DELETE /api/:collection/:id` — delete unless referenced/required by project work.

### Scope, schedule, cost, quality and reports

| Method | Endpoint | Result |
|---|---|---|
| `POST` | `/api/change-requests/:id/approve` | Atomically records before/after snapshots, updates approved budget/deadline, approves linked requirements and creates WBS work packages. |
| `POST` | `/api/change-requests/:id/reject` | Rejects a pending request without approving its requirements. |
| `GET` | `/api/scope/approved` | Approved requirements only. |
| `POST` | `/api/wbs/generate` | Regenerates the project/deliverable/work-package tree from approved requirements only. |
| `GET` | `/api/wbs/tree` | Nested WBS tree excluding unapproved work packages. |
| `GET` | `/api/schedule` | CPM forward/backward passes, earliest/latest dates, critical path and slack. |
| `GET` | `/api/schedule/delays?statusDate=YYYY-MM-DD` | Progress/overdue delay and dependent activity propagation. |
| `GET` | `/api/evm?statusDate=YYYY-MM-DD` | BAC, PV, EV, AC, CPI, SPI, CV, SV, EAC, ETC, VAC and threshold warnings. |
| `GET` | `/api/evm/by-activity?statusDate=YYYY-MM-DD` | Planned, earned and actual value by activity. |
| `GET` | `/api/cost/summary` | Planned/actual totals, approved budget and over-budget flag. |
| `GET` | `/api/risks/ranked` | Risks ordered by score with rank and priority band. |
| `GET` | `/api/risks/matrix` | 5 × 5 likelihood/impact heatmap cells and risk lists. |
| `GET` | `/api/pdpc/tree` | Nested PDPC branches. |
| `GET` | `/api/defects/summary` | Defect counts by severity/status and unresolved critical count. |
| `GET` | `/api/dashboard` | Weighted progress, budget/EVM, change requests, delays, defects, risks and milestones. |
| `GET` | `/api/consistency` | Cross-collection integrity warnings and errors. |
| `GET` | `/api/report` | Full project aggregate for printable reporting. |
| `GET` | `/api/health` | Application and MongoDB connection state. |
