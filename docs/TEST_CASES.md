# Automated test cases

The results below are filled by the Jest/Supertest/MongoDB-memory-replica-set suite.

| Test ID | Module | Description | Input | Expected Result | Actual Result |
|---|---|---|---|---|---|
| CRUD-01 | Projects | Create, read, update and delete project | Valid project document | 201, 200, 200, 200 and stable `id` | PASS |
| CRUD-02 | Milestones | CRUD milestone | Name, due date, status | CRUD succeeds; project-scoped record | PASS |
| CRUD-03 | Team | CRUD team member | Name, role, responsibility, email | CRUD succeeds; project-scoped record | PASS |
| CRUD-04 | Requirements | CRUD requirement | Title, description, priority, status | CRUD succeeds with validated enum | PASS |
| CRUD-05 | WBS | CRUD deliverable node | Project parent and unique name | CRUD succeeds; parent reference preserved | PASS |
| CRUD-06 | Change control | CRUD pending change request | Cost and schedule impact, pending status | CRUD succeeds with impacts retained | PASS |
| CRUD-07 | Schedule | CRUD activity | Duration, dates, team assignee, cost | CRUD succeeds with validated dates | PASS |
| CRUD-08 | Quality | CRUD defect | Module, severity, assignee, status | CRUD succeeds with team reference | PASS |
| CRUD-09 | Quality | CRUD checklist | Deliverable and checklist items | CRUD succeeds; checked state retained | PASS |
| CRUD-10 | Quality | CRUD inspection | Expected/actual results and tester | CRUD succeeds with Pass/Fail result | PASS |
| CRUD-11 | Risk | CRUD risk | Likelihood 2, impact 3 | CRUD succeeds and score recalculates to 6 | PASS |
| CRUD-12 | PDPC | CRUD objective node | Objective text | CRUD succeeds with nested-node schema | PASS |
| CRUD-13 | Settings | CRUD EVM settings | CPI/SPI thresholds and status date | CRUD succeeds with threshold validation | PASS |
| VAL-01 | Validation | Reject invalid dates, negative duration and invalid priority | Invalid date; duration -1; unknown enum | 400 responses with validation errors | PASS |
| VAL-02 | Validation | Validate record IDs and not-found response | Invalid ObjectId and valid absent ObjectId | 400 and 404 respectively | PASS |
| SCOPE-01 | Scope | Exclude unapproved requirements from scope and WBS | Proposed AI diagnosis requirement | Scope and generated WBS contain approved requirements only | PASS |
| SCOPE-02 | Scope | Block unapproved activity/WBS links and used requirement deletion | Proposed requirement linked to WBS/activity; referenced approved requirement delete | 409 responses | PASS |
| SCOPE-03 | Change control | Approve a PKR 800,000 / 3-week change | Pending request and linked Proposed requirement | Budget PKR 5.0M→5.8M; duration 16→19 weeks; WBS updated; snapshots recorded | PASS |
| SCOPE-04 | Change control | Reject missing-impact approval and keep requirement outside scope | Pending request without cost/schedule impacts | Approval 400; requirement remains Proposed | PASS |
| SCH-01 | Schedule | Reject circular dependencies | Create predecessor link then update into a cycle | Update returns 400 with circular dependency message | PASS |
| SCH-02 | Schedule | Calculate CPM dates, critical path and slack | Seeded dependency graph | All activity dates, nonnegative slack and critical path returned | PASS |
| SCH-03 | Schedule | Propagate activity delay | Seeded partial-progress activities at status date | Delays propagate to successors; deadline impact returned | PASS |
| EVM-01 | Cost | Verify known-value earned-value formulas | BAC 1000, PV 500, EV 500, AC 250 | CPI 2, SPI 1, CV 250, SV 0, EAC 500, ETC 250, VAC 500 | PASS |
| EVM-02 | Cost | Emit critical threshold warnings | CPI 0.5 with warning 0.9/critical 0.8 | Red CPI warning returned | PASS |
| RISK-01 | Risk | Rank risks and create matrix | Seeded likelihood/impact risks | Highest score ranked first; 25 cells include every risk | PASS |
| INT-01 | Consistency | Detect invalid team and requirement references | Persist invalid activity references directly | Assignee and unapproved requirement issues reported | PASS |
| DASH-01 | Dashboard | Aggregate project summary | Seeded project | Weighted progress, approved budget, pending changes, risks and defects returned | PASS |
| REP-01 | Quality/reporting | Return PDPC, defect summary and full report | Seeded quality/project data | Nested PDPC, two unresolved critical defects and aggregate report | PASS |
| WEB-01 | Integration | Serve frontend and health check | GET `/`, `/js/api.js`, `/api/health` | HTML/JS served and JSON health response succeeds | PASS |
| ERR-01 | Errors | Return standard 404 and validation envelopes | Missing endpoint and invalid requirement body | 404/400 with `{success:false,message,errors}` | PASS |
