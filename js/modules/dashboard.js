(function (root) {
  "use strict";

  const app = root.App;

  function render(target) {
    const data = root.ProjectAPI.getDerived("dashboard");
    const charter = app.getAll("charter")[0];
    const consistency = root.ProjectAPI.getDerived("consistency");
    const summary = data;
    const delayList = (summary.delayedActivities || []).slice().sort(function (a, b) {
      return b.propagatedDelayDays - a.propagatedDelayDays;
    }).slice(0, 5);
    const issues = consistency || [];
    const consistencyTone = issues.some(function (item) { return item.severity === "error"; }) ? "danger"
      : issues.some(function (item) { return item.severity === "warning"; }) ? "warning" : "success";
    const budgetTone = summary.budget.overBudget || summary.budget.actual > summary.budget.approved ? "danger"
      : summary.budget.planned > summary.budget.approved * .9 ? "warning" : "success";
    const cpi = summary.evm.CPI;
    const spi = summary.evm.SPI;
    const scheduleTone = spi !== null && spi < .8 ? "danger" : spi !== null && spi < .9 ? "warning" : "success";
    const milestoneRows = (summary.upcomingMilestones || []).map(function (milestone) {
      return "<tr><td><strong>" + app.escape(milestone.name) + "</strong></td><td>" + app.date(milestone.dueDate) +
        "</td><td>" + app.badge(milestone.status) + "</td></tr>";
    });
    const riskRows = (summary.topRisks || []).map(function (risk, index) {
      return "<tr><td>" + (index + 1) + "</td><td><strong>" + app.escape(risk.title) +
        "</strong></td><td>" + Number(risk.likelihood) + " × " + Number(risk.impact) +
        "</td><td><strong>" + Number(risk.score) + "</strong></td></tr>";
    });
    const delayRows = delayList.map(function (activity) {
      return "<tr><td><strong>" + app.escape(activity.name) + "</strong></td><td>" + app.date(activity.projectedFinish) +
        '</td><td><span class="status delayed">+' + activity.propagatedDelayDays + " days</span></td></tr>";
    });
    const warningMessages = (summary.evm.warnings || []).map(function (warning) {
      return '<div class="banner ' + (warning.severity === "red" ? "danger" : "warning") +
        '"><div><strong>' + app.escape(warning.metric) + " performance</strong>" + app.escape(warning.message) + "</div></div>";
    });
    const completion = Math.max(0, Math.min(100, Number(summary.overallProgress) || 0));
    const project = summary.project;

    target.innerHTML = app.heading("PROJECT OVERVIEW", "Smart Healthcare PMIS",
      "Live delivery, budget, scope and quality snapshot for the five-hospital network.",
      '<button class="button button-secondary" id="print-report">Print project report</button>') +
      '<div class="banner info" style="margin-bottom:15px"><div><strong>' +
      app.escape(project.status) + " · " + project.approvedRequirements + " approved requirements · " +
      app.getAll("team").length + " project team members</strong>Baseline " + app.date(charter.startDate) +
      " – " + app.date(charter.originalDeadline) + " · Current approved deadline " +
      app.date(project.deadline) + "</div></div>" +
      '<div class="grid grid-4" style="margin-bottom:15px">' +
      '<div class="stat-card card"><span class="stat-icon">◉</span><div class="stat-label">Overall progress</div><div class="stat-value">' +
      completion.toFixed(0) + '%</div><div class="progress-track"><div class="progress-fill" style="width:' + completion.toFixed(2) + '%"></div></div></div>' +
      '<div class="stat-card card ' + (budgetTone === "danger" ? "alert" : budgetTone === "warning" ? "warn" : "") +
      '"><span class="stat-icon">₨</span><div class="stat-label">Budget status</div><div class="stat-value">' +
      app.money(summary.budget.approved) + '</div><div class="stat-foot">Approved · ' + app.money(summary.budget.planned) +
      " planned · " + app.money(summary.budget.actual) + " actual</div></div>" +
      '<div class="stat-card card ' + (cpi !== null && cpi < .8 ? "alert" : cpi !== null && cpi < .9 ? "warn" : "") +
      '"><span class="stat-icon">C</span><div class="stat-label">CPI · cost performance</div><div class="stat-value">' +
      (cpi === null ? "N/A" : Number(cpi).toFixed(2)) + '</div><div class="stat-foot">Cost variance ' + app.money(summary.evm.CV) + "</div></div>" +
      '<div class="stat-card card ' + (scheduleTone === "danger" ? "alert" : scheduleTone === "warning" ? "warn" : "") +
      '"><span class="stat-icon">S</span><div class="stat-label">SPI · schedule performance</div><div class="stat-value">' +
      (spi === null ? "N/A" : Number(spi).toFixed(2)) + '</div><div class="stat-foot">Finish ' + app.date(summary.delayedActivities.length
        ? summary.delayedActivities.reduce(function (max, item) { return item.projectedFinish > max ? item.projectedFinish : max; }, project.deadline)
        : project.deadline) + "</div></div></div>" +
      '<div class="grid grid-3" style="margin-bottom:15px">' +
      '<div class="stat-card card blue"><span class="stat-icon">↻</span><div class="stat-label">Pending changes</div><div class="stat-value">' +
      summary.pendingChangeRequests + '</div><div class="stat-foot">Awaiting sponsor decision</div></div>' +
      '<div class="stat-card card ' + (delayList.length ? "warn" : "") + '"><span class="stat-icon">◷</span><div class="stat-label">Delayed activities</div><div class="stat-value">' +
      summary.delayedActivities.length + '</div><div class="stat-foot">Final deadline impact: ' +
      (summary.finalDeadlineImpactDays ? "+" + summary.finalDeadlineImpactDays + " days" : "On track") + "</div></div>" +
      '<div class="stat-card card ' + (summary.unresolvedCriticalDefects ? "alert" : "") + '"><span class="stat-icon">!</span><div class="stat-label">Unresolved critical defects</div><div class="stat-value">' +
      summary.unresolvedCriticalDefects + '</div><div class="stat-foot">' + summary.defectSummary.byStatus.Open +
      " open defects overall</div></div></div>" +
      (warningMessages.length ? '<div class="stack" style="margin-bottom:15px">' + warningMessages.join("") + "</div>" : "") +
      '<div class="grid grid-2">' +
      app.card("Schedule watchlist", app.table(["Delayed activity", "Forecast end", "Impact"], delayRows), {
        description: "Progress-based and overdue delays propagated through dependent activities.",
        action: app.button("View schedule", "open-schedule", "schedule")
      }) +
      app.card("Upcoming milestones", app.table(["Milestone", "Due date", "Status"], milestoneRows), {
        description: "Next incomplete project checkpoints.",
        action: app.button("Manage milestones", "open-initiation", "initiation")
      }) +
      app.card("Highest project risks", app.table(["Rank", "Risk", "Likelihood × impact", "Score"], riskRows), {
        description: "Prioritized by server-calculated likelihood × impact.",
        action: app.button("Review risks", "open-quality", "quality")
      }) +
      app.card("Approved budget & scope", '<div class="impact-grid"><div class="impact-value"><small>Original approval</small><strong>' +
        app.money(charter.originalBudget) + '</strong><small style="margin-top:5px">' +
        Math.round((Date.parse(charter.originalDeadline) - Date.parse(charter.startDate)) / 604800000) + " weeks · " +
        app.date(charter.originalDeadline) + '</small></div><span class="impact-arrow">→</span><div class="impact-value">' +
        '<small>Current approval</small><strong>' + app.money(summary.budget.approved) +
        '</strong><small style="margin-top:5px">' + project.approvedDurationWeeks + " weeks · " +
        app.date(project.deadline) + "</small></div></div><p class=\"page-subtitle\" style=\"margin:12px 0 0\">" + project.approvedRequirements +
        " approved requirements are included in the WBS. Activity cost estimates total " + app.money(summary.budget.planned) +
        "; actual spend recorded to date is " + app.money(summary.budget.actual) + ".</p>", {
        description: "Pending change requests do not alter approved scope or budget."
      }) + "</div>" +
      '<div class="section-kicker">Data integrity</div>' +
      app.card("Consistency check", '<div class="stack">' + issues.map(function (issue) {
        const tone = issue.severity === "error" ? "danger" : issue.severity === "warning" ? "warning" : "success";
        return '<div class="banner ' + tone + '"><div>' + app.escape(issue.message) + "</div></div>";
      }).join("") + "</div>", {
        description: "Cross-module assignment, dependency, change-control and requirement integrity checks."
      }) +
      '<p class="page-subtitle" style="margin-top:16px">Smart Healthcare Project Management &amp; Monitoring System · Internal project report · Generated ' +
      app.date(summary.statusDate) + "</p>";

    target.querySelector("#print-report").addEventListener("click", function () { window.print(); });
    target.querySelectorAll("[data-action]").forEach(function (element) {
      element.addEventListener("click", function () { app.goTo(element.dataset.id); });
    });
  }

  app.register("dashboard", { render: render });
}(window));
