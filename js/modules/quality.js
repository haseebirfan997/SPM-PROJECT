(function (root) {
  "use strict";

  const app = root.App;
  const defectModules = ["Appointment Scheduling", "Patient Records", "Laboratory Reports", "Doctor Schedules", "Online Consultations", "Hospital Billing"];
  const defectSeverities = ["Critical", "High", "Medium", "Low"];
  const defectStatuses = ["Open", "In Progress", "Resolved", "Closed"];
  const itemButton = function (label, action, id, kind) {
    return '<button class="button ' + (kind || "button-secondary") + ' button-small" data-action="' +
      app.escape(action) + '" data-id="' + app.escape(id) + '">' + app.escape(label) + "</button>";
  };
  const actions = function (editAction, deleteAction, id) {
    return '<span class="actions-cell">' + itemButton("Edit", editAction, id) + itemButton("Delete", deleteAction, id, "button-danger") + "</span>";
  };

  function render(target) {
    const team = app.getAll("team");
    const defects = app.getAll("defects");
    const checklists = app.getAll("checklists");
    const inspections = app.getAll("inspections");
    const riskById = new Map(app.getAll("risks").map(function (risk) { return [risk.id, risk]; }));
    const risks = root.ProjectAPI.getDerived("rankedRisks").map(function (risk) {
      return Object.assign({}, riskById.get(risk.id), risk);
    });
    const matrix = root.ProjectAPI.getDerived("riskMatrix").grid;
    const pdpc = app.getAll("pdpc");
    const memberName = function (id) {
      const member = team.find(function (person) { return person.id === id; });
      return member ? member.name : "Unassigned";
    };
    const defectRows = defects.map(function (defect) {
      return "<tr><td><strong>" + app.escape(defect.title) + '<span class="table-sub">' + app.escape(defect.module) +
        "</span></strong></td><td>" + app.badge(defect.severity) + "</td><td>" + app.escape(memberName(defect.assigneeId)) +
        "</td><td>" + app.badge(defect.status) + "</td><td>" + app.date(defect.dateReported) +
        "</td><td>" + actions("edit-defect", "delete-defect", defect.id) + "</td></tr>";
    });
    const checklistCards = checklists.map(function (checklist) {
      const done = checklist.items.filter(function (item) { return item.done; }).length;
      return '<article class="card"><div class="card-header"><div><h2 class="card-title">' + app.escape(checklist.deliverable) +
        '</h2><p class="card-description">' + done + " of " + checklist.items.length + " quality checks complete</p></div>" +
        actions("edit-checklist", "delete-checklist", checklist.id) + '</div><div class="card-body">' +
        checklist.items.map(function (item) {
          return '<label class="checklist-item"><input type="checkbox" data-checklist="' + app.escape(checklist.id) +
            '" data-item="' + app.escape(item.id) + '"' + (item.done ? " checked" : "") + ">" +
            app.escape(item.label) + "</label>";
        }).join("") + "</div></article>";
    }).join("");
    const inspectionRows = inspections.map(function (inspection) {
      return "<tr><td><strong>" + app.escape(inspection.deliverable) + '<span class="table-sub">' + app.escape(inspection.name) +
        "</span></strong></td><td>" + app.escape(inspection.expected) + "</td><td>" + app.escape(inspection.actual) +
        "</td><td>" + app.badge(inspection.result) + "</td><td>" + app.date(inspection.date) + "</td><td>" +
        app.escape(memberName(inspection.testerId)) + "</td><td>" + actions("edit-inspection", "delete-inspection", inspection.id) + "</td></tr>";
    });
    const heatMap = [];
    for (let likelihood = 5; likelihood >= 1; likelihood -= 1) {
      heatMap.push('<span class="risk-axis">' + likelihood + "</span>");
      for (let impact = 1; impact <= 5; impact += 1) {
        const cell = matrix[5 - likelihood][impact - 1];
        const matching = risks.filter(function (risk) {
          return Number(risk.likelihood) === likelihood && Number(risk.impact) === impact;
        });
        const score = cell.score;
        const tone = score >= 20 ? "critical" : score >= 12 ? "high" : score >= 6 ? "mid" : "";
        const labels = matching.map(function (risk) { return risk.title; });
        heatMap.push('<span class="risk-cell ' + tone + (matching.length ? " has-risk" : "") +
          '" title="Likelihood ' + likelihood + ", impact " + impact + (labels.length ? " · " + app.escape(labels.join("; ")) : "") +
          '" aria-label="Likelihood ' + likelihood + ', impact ' + impact + ', ' + matching.length + ' risks">' +
          (matching.length ? matching.length : score) + "</span>");
      }
    }
    const riskRows = risks.map(function (risk, index) {
      return "<tr><td>" + (index + 1) + "</td><td><strong>" + app.escape(risk.title) + "</strong></td><td>" +
        Number(risk.likelihood) + "</td><td>" + Number(risk.impact) + "</td><td><strong>" +
        Number(risk.score) + "</strong></td><td>" + actions("edit-risk", "delete-risk", risk.id) + "</td></tr>";
    });
    const pdpcGroups = Array.from(new Set(pdpc.map(function (item) { return item.objective; }))).map(function (objective) {
      const branches = pdpc.filter(function (item) { return item.objective === objective; }).map(function (item) {
        return '<div class="pdpc-risk"><div class="pdpc-problem">Risk / potential problem · ' + app.escape(item.risk) +
        '</div><div class="pdpc-actions"><div class="pdpc-action"><strong>Preventive action</strong><br>' +
        app.escape(item.preventiveAction) + '</div><div class="pdpc-action"><strong>Corrective / contingency action</strong><br>' +
        app.escape(item.contingencyAction) + '</div></div><div style="margin-top:6px">' +
        actions("edit-pdpc", "delete-pdpc", item.id) + "</div></div>";
      }).join("");
      return '<div class="pdpc-objective">Objective · ' + app.escape(objective) + "</div>" + branches;
    }).join("");

    target.innerHTML = app.heading("QUALITY ASSURANCE", "Quality management & risk control",
      "Track defects, verify deliverables and proactively manage delivery risks.",
      itemButton("+ Add defect", "add-defect", "new", "button")) +
      '<div class="banner danger" style="margin-bottom:15px"><div><strong>Critical defects require immediate triage</strong>' +
      root.ProjectAPI.getDerived("defectSummary").unresolvedCritical +
      " unresolved critical defects currently affect appointment scheduling and patient records.</div></div>" +
      app.card("Defect tracker", app.table(["Defect", "Severity", "Assigned to", "Status", "Reported", "Actions"], defectRows), {
        description: "Protect patient records and appointment scheduling through priority-based defect triage.",
        action: itemButton("+ Add defect", "add-defect", "new")
      }) +
      '<div class="section-kicker">Deliverable verification</div><div class="grid grid-2">' +
      (checklistCards || app.card("Quality checklists", app.empty("Add a deliverable checklist."))) + "</div>" +
      '<div class="heading-actions" style="margin:10px 0 15px">' + itemButton("+ Add checklist", "add-checklist", "new") + "</div>" +
      app.card("Inspection & testing results", app.table(["Deliverable / test", "Expected result", "Actual result", "Result", "Date", "Tester", "Actions"], inspectionRows), {
        description: "Record observable acceptance and inspection results.",
        action: itemButton("+ Record test", "add-inspection", "new")
      }) +
      '<div class="section-kicker">Risk & decision analysis</div><div class="grid grid-2">' +
      app.card("5 × 5 prioritization matrix", '<div class="risk-grid">' + heatMap.join("") +
        '</div><div class="risk-legend"><span><i class="heat-swatch" style="background:#e9f4ec"></i>Low</span>' +
        '<span><i class="heat-swatch" style="background:#fff0cc"></i>Moderate</span><span><i class="heat-swatch" style="background:#f7d5cc"></i>High</span>' +
        '<span><i class="heat-swatch" style="background:#d66b68"></i>Critical</span></div>', {
        description: "Likelihood (vertical) × impact (horizontal); outlined cells contain risks.",
        action: '<span class="muted">Impact →</span>'
      }) +
      app.card("Ranked project risks", app.table(["Rank", "Risk", "Likelihood", "Impact", "Score", "Actions"], riskRows), {
        description: "Score = likelihood × impact (each rated from 1 to 5).",
        action: itemButton("+ Add risk", "add-risk", "new")
      }) + "</div>" +
      '<div class="section-kicker">Process decision program chart</div>' +
      app.card("PDPC · contingency planning", '<div class="pdpc-tree">' +
        (pdpcGroups || app.empty("Add an objective and potential problems with preventive and contingency actions.")) + "</div>", {
        description: "Objective > potential problem > preventive action > corrective or contingency action.",
        action: itemButton("+ Add PDPC branch", "add-pdpc", "new")
      });
    target.querySelectorAll("[data-action]").forEach(function (element) {
      element.addEventListener("click", function () {
        Promise.resolve(handleAction(element.dataset.action, element.dataset.id)).catch(function (error) { app.toast(error.message, true); });
      });
    });
    target.querySelectorAll("[data-checklist]").forEach(function (checkbox) {
      checkbox.addEventListener("change", async function () {
        const checklist = app.getById("checklists", checkbox.dataset.checklist);
        const items = checklist.items.map(function (item) {
          return item.id === checkbox.dataset.item ? Object.assign({}, item, { done: checkbox.checked }) : item;
        });
        await app.update("checklists", checklist.id, { items: items });
        app.refresh();
      });
    });
  }

  function defectForm(defect) {
    const team = app.getAll("team");
    app.openForm({
      title: defect ? "Edit defect" : "Add defect", initial: defect || { dateReported: new Date().toISOString().slice(0, 10), status: "Open", severity: "Medium" },
      fields: [
        { name: "title", label: "Defect title", required: true, full: true },
        { name: "module", label: "Healthcare module", type: "select", options: defectModules, required: true },
        { name: "severity", label: "Severity", type: "select", options: defectSeverities, required: true },
        { name: "assigneeId", label: "Assigned team member", type: "select", options: team.map(function (member) {
          return { value: member.id, label: member.name + " · " + member.role };
        }), required: true },
        { name: "status", label: "Status", type: "select", options: defectStatuses, required: true },
        { name: "dateReported", label: "Date reported", type: "date", required: true }
      ],
      validate: function (values) {
        return team.some(function (member) { return member.id === values.assigneeId; }) ? "" : "Select a current project team member.";
      },
      onSubmit: function (values) {
        if (defect) return app.update("defects", defect.id, values);
        return app.add("defects", values);
      }
    });
  }

  function checklistForm(checklist) {
    const all = app.getAll("checklists");
    app.openForm({
      title: checklist ? "Edit quality checklist" : "Add quality checklist",
      initial: checklist ? { deliverable: checklist.deliverable, itemText: checklist.items.map(function (item) { return item.label; }).join("\n") } : {},
      fields: [
        { name: "deliverable", label: "Deliverable", required: true },
        { name: "itemText", label: "Checklist items (one per line)", type: "textarea", required: true, full: true }
      ],
      validate: function (values) {
        if (!root.ProjectValidation.uniqueName(values.deliverable, all, checklist && checklist.id, "deliverable")) return "A checklist already exists for this deliverable.";
        if (!values.itemText.split("\n").some(function (item) { return item.trim(); })) return "Add at least one checklist item.";
        return "";
      },
      onSubmit: function (values) {
        const oldItems = checklist ? checklist.items : [];
        const items = values.itemText.split("\n").map(function (label) { return label.trim(); }).filter(Boolean).map(function (label) {
          const old = oldItems.find(function (item) { return item.label.toLowerCase() === label.toLowerCase(); });
          return { id: old ? old.id : "check-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), label: label, done: old ? old.done : false };
        });
        const result = { deliverable: values.deliverable, items: items };
        if (checklist) return app.update("checklists", checklist.id, result);
        return app.add("checklists", result);
      }
    });
  }

  function inspectionForm(inspection) {
    const team = app.getAll("team");
    app.openForm({
      title: inspection ? "Edit inspection result" : "Record inspection result",
      initial: inspection || { date: new Date().toISOString().slice(0, 10), result: "Fail" },
      fields: [
        { name: "deliverable", label: "Deliverable", required: true },
        { name: "name", label: "Inspection / test name", required: true },
        { name: "expected", label: "Expected result", type: "textarea", required: true },
        { name: "actual", label: "Actual result", type: "textarea", required: true },
        { name: "result", label: "Result", type: "select", options: ["Pass", "Fail"], required: true },
        { name: "date", label: "Test date", type: "date", required: true },
        { name: "testerId", label: "Tester", type: "select", options: team.map(function (member) {
          return { value: member.id, label: member.name + " · " + member.role };
        }), required: true }
      ],
      validate: function (values) {
        return team.some(function (member) { return member.id === values.testerId; }) ? "" : "Select a current project team member.";
      },
      onSubmit: function (values) {
        if (inspection) return app.update("inspections", inspection.id, values);
        return app.add("inspections", values);
      }
    });
  }

  function riskForm(risk) {
    const risks = app.getAll("risks");
    app.openForm({
      title: risk ? "Edit risk" : "Add project risk",
      initial: risk || { likelihood: 3, impact: 3 },
      fields: [
        { name: "title", label: "Risk / issue", required: true, full: true },
        { name: "likelihood", label: "Likelihood (1–5)", type: "number", min: 1, max: 5, step: 1, required: true },
        { name: "impact", label: "Impact (1–5)", type: "number", min: 1, max: 5, step: 1, required: true },
        { name: "preventiveAction", label: "Preventive action", type: "textarea", required: true },
        { name: "contingencyAction", label: "Corrective / contingency action", type: "textarea", required: true }
      ],
      validate: function (values) {
        return root.ProjectValidation.uniqueName(values.title, risks, risk && risk.id, "title") ? "" : "Risk names must be unique.";
      },
      onSubmit: function (values) {
        if (risk) return app.update("risks", risk.id, values);
        return app.add("risks", values);
      }
    });
  }

  function pdpcForm(item) {
    const entries = app.getAll("pdpc");
    app.openForm({
      title: item ? "Edit PDPC branch" : "Add PDPC branch",
      initial: item || {},
      fields: [
        { name: "objective", label: "Objective", required: true, full: true },
        { name: "risk", label: "Risk / potential problem", required: true, full: true },
        { name: "preventiveAction", label: "Preventive action", type: "textarea", required: true },
        { name: "contingencyAction", label: "Corrective / contingency action", type: "textarea", required: true }
      ],
      validate: function (values) {
        if (!root.ProjectValidation.uniqueName(values.risk, entries, item && item.id, "risk")) return "A PDPC branch for this potential problem already exists.";
        return "";
      },
      onSubmit: function (values) {
        if (item) return app.update("pdpc", item.id, values);
        return app.add("pdpc", values);
      }
    });
  }

  async function handleAction(action, id) {
    const map = {
      "edit-defect": ["defects", defectForm], "edit-checklist": ["checklists", checklistForm],
      "edit-inspection": ["inspections", inspectionForm], "edit-risk": ["risks", riskForm], "edit-pdpc": ["pdpc", pdpcForm]
    };
    const deletion = {
      "delete-defect": ["defects", "defect"], "delete-checklist": ["checklists", "checklist"],
      "delete-inspection": ["inspections", "inspection"], "delete-risk": ["risks", "risk"], "delete-pdpc": ["pdpc", "PDPC branch"]
    };
    if (action === "add-defect") defectForm(null);
    else if (action === "add-checklist") checklistForm(null);
    else if (action === "add-inspection") inspectionForm(null);
    else if (action === "add-risk") riskForm(null);
    else if (action === "add-pdpc") pdpcForm(null);
    else if (map[action]) {
      const record = app.getById(map[action][0], id);
      if (record) map[action][1](record);
    } else if (deletion[action]) {
      const record = app.getById(deletion[action][0], id);
      if (!record || !window.confirm("Delete this " + deletion[action][1] + "?")) return;
      await app.remove(deletion[action][0], id);
      app.toast("Record deleted.");
      app.refresh();
    }
  }

  app.register("quality", { render: render });
}(window));
