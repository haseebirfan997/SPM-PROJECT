(function (root) {
  "use strict";

  const app = root.App;
  const today = function () { return new Date().toISOString().slice(0, 10); };
  const statusTone = function (status) { return status === "critical" ? "danger" : status === "warning" ? "warning" : "success"; };
  const statusText = function (status) { return status === "critical" ? "Critical" : status === "warning" ? "Needs attention" : "On track"; };

  function render(target) {
    const activities = app.getAll("activities");
    const charter = app.getAll("charter")[0];
    const settings = app.getAll("settings")[0];
    const evm = root.ProjectAPI.getDerived("evm");
    const byActivity = new Map(root.ProjectAPI.getDerived("evmByActivity").map(function (item) { return [item.id, item]; }));
    const approvedBudget = charter.approvedBudget;
    const costSummary = root.ProjectAPI.getDerived("dashboard").budget;
    const messages = evm.warnings.map(function (warning) {
      return { tone: warning.severity === "red" ? "danger" : "warning", title: warning.metric + " performance warning", body: warning.message };
    });
    if (costSummary.overBudget) messages.unshift({ tone: "danger", title: "Budget overrun detected", body: "Planned activity cost exceeds the current approved budget." });
    const cpiStatus = evm.CPI === null ? "warning" : evm.CPI < evm.thresholds.cpiCritical ? "critical" : evm.CPI < evm.thresholds.cpiWarning ? "warning" : "good";
    const spiStatus = evm.SPI === null ? "warning" : evm.SPI < evm.thresholds.spiCritical ? "critical" : evm.SPI < evm.thresholds.spiWarning ? "warning" : "good";
    const maxValue = Math.max(1, evm.PV, evm.EV, evm.AC);
    const bar = function (value, className, label) {
      return '<div class="chart-bar ' + className + '" style="height:' + Math.max(2, value / maxValue * 100).toFixed(2) +
        '%" title="' + app.escape(label + ": " + app.money(value)) + '"></div>';
    };
    const costRows = activities.map(function (activity) {
      const itemEvm = byActivity.get(activity.id);
      return "<tr><td><strong>" + app.escape(activity.name) + "</strong></td><td>" + app.money(activity.plannedCost) +
        "</td><td>" + app.money(activity.actualCost) + "</td><td>" + Number(activity.percentComplete) +
        "%</td><td>" + app.money(itemEvm ? itemEvm.EV : 0) +
        "</td><td>" + app.button("Edit cost", "edit-cost", activity.id) + "</td></tr>";
    });
    const indicator = function (title, value, tone) {
      return '<div class="stat-card card ' + (tone === "critical" ? "alert" : tone === "warning" ? "warn" : "") +
        '"><span class="stat-icon">' + (tone === "critical" ? "!" : tone === "warning" ? "↗" : "✓") +
        '</span><div class="stat-label">' + app.escape(title) + '</div><div class="stat-value">' +
        app.escape(value) + '</div><div class="stat-foot">' + app.escape(statusText(tone)) + "</div></div>";
    };

    target.innerHTML = app.heading("FINANCIAL CONTROL", "Cost & earned value",
      "Compare the approved budget with activity estimates, actual cost and earned progress.",
      app.button("Edit EVM thresholds", "edit-thresholds", settings.id, "button-secondary")) +
      '<div class="grid grid-4" style="margin-bottom:15px">' +
      '<div class="stat-card card"><span class="stat-icon">₨</span><div class="stat-label">Planned budget · BAC</div><div class="stat-value">' +
      app.money(evm.BAC) + '</div><div class="stat-foot">Approved: ' + app.money(approvedBudget) + "</div></div>" +
      '<div class="stat-card card blue"><span class="stat-icon">◷</span><div class="stat-label">Planned value · PV</div><div class="stat-value">' +
      app.money(evm.PV) + '</div><div class="stat-foot">Status date: ' + app.date(evm.statusDate) + "</div></div>" +
      '<div class="stat-card card"><span class="stat-icon">✓</span><div class="stat-label">Earned value · EV</div><div class="stat-value">' +
      app.money(evm.EV) + '</div><div class="stat-foot">Budgeted cost of work performed</div></div>' +
      '<div class="stat-card card warn"><span class="stat-icon">₨</span><div class="stat-label">Actual cost · AC</div><div class="stat-value">' +
      app.money(evm.AC) + '</div><div class="stat-foot">' + (evm.AC > approvedBudget ? "Above approved budget" : "Recorded activity actuals") + "</div></div></div>" +
      '<div class="grid grid-4" style="margin-bottom:15px">' +
      indicator("CPI · cost index", evm.CPI === null ? "N/A" : evm.CPI.toFixed(2), cpiStatus) +
      indicator("SPI · schedule index", evm.SPI === null ? "N/A" : evm.SPI.toFixed(2), spiStatus) +
      indicator("CV · EV − AC", app.money(evm.CV), evm.CV < 0 ? "critical" : "good") +
      indicator("SV · EV − PV", app.money(evm.SV), evm.SV < 0 ? "warning" : "good") +
      "</div>" +
      (messages.length ? '<div class="stack" style="margin-bottom:15px">' + messages.map(function (message) {
        return '<div class="banner ' + message.tone + '"><div><strong>' + app.escape(message.title) + "</strong>" +
          app.escape(message.body) + "</div></div>";
      }).join("") + "</div>" : '<div class="banner success" style="margin-bottom:15px"><div><strong>Cost and schedule indicators are within configured thresholds.</strong>No automatic EVM warning is currently active.</div></div>') +
      '<div class="grid grid-2">' +
      app.card("EVM comparison", '<div class="chart">' +
        '<div class="chart-group">' + bar(evm.PV, "pv", "PV") + bar(evm.EV, "ev", "EV") + bar(evm.AC, "ac", "AC") +
        '<span class="chart-label">Cumulative value</span></div></div>' +
        '<div class="chart-legend"><span><i></i> PV</span><span><i class="ev"></i> EV</span><span><i class="ac"></i> AC</span></div>',
        { description: "Value as of the selected status date" }) +
      app.card("Status date & thresholds", '<div class="form-field"><label for="evm-status-date">EVM status date</label><input id="evm-status-date" type="date" value="' +
        app.escape(settings.statusDate || today()) + '"></div><div class="metric-row" style="margin-top:13px">' +
        '<div class="metric-box"><small>CPI warning / critical</small><strong>' + Number(settings.cpiWarning).toFixed(2) + " / " + Number(settings.cpiCritical).toFixed(2) +
        '</strong></div><div class="metric-box"><small>SPI warning / critical</small><strong>' + Number(settings.spiWarning).toFixed(2) +
        " / " + Number(settings.spiCritical).toFixed(2) + '</strong></div><div class="metric-box"><small>Thresholds</small><strong>Configurable</strong></div></div>', {
        description: "Default warning below 0.90; critical below 0.80"
      }) + "</div>" +
      '<div class="section-kicker">Activity costs</div>' +
      app.card("Activity cost register", app.table(["Activity", "Planned estimate", "Actual cost", "Progress", "Earned value", "Actions"], costRows), {
        description: "Adjust an activity's planned cost, actual spend and completion percentage.",
        action: '<span class="muted">BAC compared with ' + app.money(approvedBudget) + " approved</span>"
      });

    target.querySelectorAll("[data-action]").forEach(function (element) {
      element.addEventListener("click", function () {
        try {
          if (element.dataset.action === "edit-cost") editCost(element.dataset.id);
          if (element.dataset.action === "edit-thresholds") editThresholds(element.dataset.id);
        } catch (error) { app.toast(error.message, true); }
      });
    });
    target.querySelector("#evm-status-date").addEventListener("change", async function (event) {
      if (!event.target.value) {
        app.toast("Choose a valid status date.", true);
        event.target.value = settings.statusDate || today();
        return;
      }
      await app.update("settings", settings.id, { statusDate: event.target.value });
      app.toast("EVM status date updated.");
      app.refresh();
    });
  }

  function editCost(id) {
    const activity = app.getById("activities", id);
    if (!activity) {
      app.toast("The activity could not be found.", true);
      return;
    }
    app.openForm({
      title: "Update cost · " + activity.name, initial: activity,
      fields: [
        { name: "plannedCost", label: "Planned cost (PKR)", type: "number", min: 0, step: 1, required: true },
        { name: "actualCost", label: "Actual cost (PKR)", type: "number", min: 0, step: 1, required: true },
        { name: "percentComplete", label: "Percent complete", type: "number", min: 0, max: 100, step: 1, required: true }
      ],
      onSubmit: function (values) { return app.update("activities", id, values); }
    });
  }

  function editThresholds(id) {
    const settings = app.getById("settings", id);
    app.openForm({
      title: "Configure EVM thresholds", initial: settings,
      fields: [
        { name: "statusDate", label: "Status date", type: "date", required: true },
        { name: "cpiWarning", label: "CPI warning below", type: "number", min: 0, max: 2, step: .01, required: true },
        { name: "cpiCritical", label: "CPI critical below", type: "number", min: 0, max: 2, step: .01, required: true },
        { name: "spiWarning", label: "SPI warning below", type: "number", min: 0, max: 2, step: .01, required: true },
        { name: "spiCritical", label: "SPI critical below", type: "number", min: 0, max: 2, step: .01, required: true }
      ],
      validate: function (values) {
        if (Number(values.cpiCritical) >= Number(values.cpiWarning) || Number(values.spiCritical) >= Number(values.spiWarning)) {
          return "Each critical threshold must be lower than its warning threshold.";
        }
        return "";
      },
      onSubmit: function (values) { return app.update("settings", id, values); }
    });
  }

  app.register("cost", { render: render });
}(window));
