(function (root) {
  "use strict";

  const app = root.App;
  const statuses = ["Not Started", "In Progress", "On Hold", "Completed"];
  const withActions = function (id, actions) {
    return '<div class="actions-cell">' + actions.map(function (action) {
      return app.button(action.label, action.name, id, action.kind);
    }).join("") + "</div>";
  };

  function render(target) {
    const charter = app.getAll("charter")[0];
    const plans = app.getAll("plans")[0];
    const team = app.getAll("team");
    const milestones = app.getAll("milestones");
    const closure = app.getAll("closure")[0];
    const effectiveBudget = Number(charter.approvedBudget);
    const effectiveDeadline = charter.deadline;
    target.innerHTML = app.heading("PROJECT FOUNDATION", "Initiation & integration",
      "Keep the project charter, delivery plan, team and closure record aligned.",
      app.button("Edit project charter", "edit-charter", "project-charter", "button-secondary")) +
      '<div class="grid grid-2">' +
      app.card("Project charter", '<div class="grid grid-2"><div><p class="eyebrow">PROJECT TITLE</p><strong>' + app.escape(charter.title) +
        '</strong><p class="page-subtitle" style="margin-top:8px">' + app.escape(charter.objectives) +
        '</p></div><div><p class="eyebrow">PROJECT STATUS</p>' + app.badge(charter.status) +
        '<div class="form-field" style="margin-top:9px"><select id="project-status" aria-label="Project status">' +
        statuses.map(function (status) { return '<option' + (status === charter.status ? " selected" : "") + ">" + app.escape(status) + "</option>"; }).join("") +
        '</select></div></div><div><p class="eyebrow">SCOPE BOUNDARIES</p><strong>In scope</strong><p class="page-subtitle">' +
        app.escape(charter.inScope) + '</p><strong>Out of scope</strong><p class="page-subtitle">' + app.escape(charter.outOfScope) +
        '</p></div><div><p class="eyebrow">BASELINE &amp; APPROVED CHANGE</p><strong>' + app.money(charter.approvedBudget) +
        '</strong><p class="page-subtitle">Baseline budget</p><strong>' + app.money(effectiveBudget) +
        '</strong><p class="page-subtitle">Current approved budget</p><p class="page-subtitle" style="margin-top:8px">Baseline deadline: ' +
        app.date(charter.deadline) + '<br>Current approved deadline: ' + app.date(effectiveDeadline) +
        '<br>Start date: ' + app.date(charter.startDate) + '</p></div></div>', {
        description: "Five-hospital healthcare delivery charter",
        action: app.button("Edit", "edit-charter", charter.id)
      }) +
      app.card("Stakeholders", '<div id="stakeholder-list">' +
        (charter.stakeholders || []).map(function (stakeholder, index) {
          return '<div class="list-row"><div><strong>' + app.escape(stakeholder.name) + '</strong><small>' +
            app.escape(stakeholder.role) + '</small></div>' +
            withActions(String(index), [{ label: "Edit", name: "edit-stakeholder" }, { label: "Remove", name: "remove-stakeholder", kind: "button-danger" }]) +
            "</div>";
        }).join("") + (charter.stakeholders && charter.stakeholders.length ? "" : app.empty("Add project stakeholders to the charter.")) +
        '</div><div style="margin-top:10px">' + app.button("+ Add stakeholder", "add-stakeholder", charter.id) + "</div>", {
        description: "Sponsor, clinical, technical and end-user representatives"
      }) +
      "</div><div class=\"section-kicker\">Management plan</div><div class=\"grid grid-2\">" +
      app.card("Project management plan", '<div class="stack">' +
        [["scope", "Scope"], ["schedule", "Schedule"], ["cost", "Cost"], ["quality", "Quality"]].map(function (entry) {
          return '<div><p class="eyebrow">' + entry[1].toUpperCase() + "</p><p class=\"page-subtitle\">" + app.escape(plans[entry[0]]) + "</p></div>";
        }).join("") + "</div>", { action: app.button("Edit plan", "edit-plan", plans.id) }) +
      app.card("Milestones", app.table(["Milestone", "Due date", "Status", "Actions"], milestones.map(function (item) {
        return "<tr><td><strong>" + app.escape(item.name) + "</strong></td><td>" + app.date(item.dueDate) + "</td><td>" +
          app.badge(item.status) + "</td><td>" + app.editDelete(item.id) + "</td></tr>";
      })), { action: app.button("+ Add milestone", "add-milestone", "milestone") }) +
      "</div><div class=\"section-kicker\">People &amp; closure</div><div class=\"grid grid-2\">" +
      app.card("Responsibilities", app.table(["Team member", "Role", "Responsibility", "Actions"], team.map(function (person) {
        return "<tr><td><strong>" + app.escape(person.name) + "</strong></td><td>" + app.escape(person.role) +
          "</td><td>" + app.escape(person.responsibility) + "</td><td>" + app.editDelete(person.id) + "</td></tr>";
      })), { action: app.button("+ Add team member", "add-team", "team") }) +
      app.card("Project closure record", closure
        ? '<p class="eyebrow">LESSONS LEARNED</p><p class="page-subtitle">' + app.escape(closure.lessonsLearned) +
          '</p><div class="grid grid-2"><div><p class="eyebrow">FINAL COST</p><strong>' + app.money(closure.finalCost) +
          '</strong></div><div><p class="eyebrow">COMPLETION DATE</p><strong>' + app.date(closure.completionDate) +
          '</strong></div><div><p class="eyebrow">SIGN-OFF</p>' + app.badge(closure.signOffStatus) + "</div></div>"
        : app.empty("No closure record has been entered."), {
        action: app.button(closure ? "Edit closure" : "Add closure record", "edit-closure", closure ? closure.id : "new")
      }) + "</div>";

    target.querySelectorAll("[data-action]").forEach(function (element) {
      element.addEventListener("click", function () {
        Promise.resolve(handleAction(element.dataset.action, element.dataset.id)).catch(function (error) { app.toast(error.message, true); });
      });
    });
    target.querySelector("#project-status").addEventListener("change", async function (event) {
      await app.update("charter", charter.id, { status: event.target.value });
      app.toast("Project status updated.");
      app.refresh();
    });
  }

  async function handleAction(action, id) {
    const charter = app.getAll("charter")[0];
    const team = app.getAll("team");
    const milestones = app.getAll("milestones");
    const lookup = function (rows) { return rows.find(function (row) { return row.id === id; }); };
    if (action === "edit-charter") {
      app.openForm({
        title: "Edit project charter", initial: charter,
        fields: [
          { name: "title", label: "Project title", required: true, full: true },
          { name: "objectives", label: "Objectives", type: "textarea", required: true, full: true },
          { name: "inScope", label: "In-scope boundaries", type: "textarea", required: true },
          { name: "outOfScope", label: "Out-of-scope boundaries", type: "textarea", required: true },
          { name: "approvedBudget", label: "Approved baseline budget (PKR)", type: "number", min: 0, step: 1, required: true },
          { name: "status", label: "Project status", type: "select", options: statuses, required: true },
          { name: "startDate", label: "Start date", type: "date", required: true },
          { name: "deadline", label: "Baseline deadline", type: "date", required: true }
        ],
        validate: function (values) {
          return root.ProjectValidation.dateOrder(values.startDate, values.deadline) ? "" : "The deadline must be on or after the start date.";
        },
        onSubmit: function (values) { return app.update("charter", charter.id, values); }
      });
    } else if (action === "add-stakeholder" || action === "edit-stakeholder") {
      const index = action === "edit-stakeholder" ? Number(id) : -1;
      const initial = index >= 0 ? charter.stakeholders[index] : {};
      app.openForm({
        title: index >= 0 ? "Edit stakeholder" : "Add stakeholder",
        initial: initial,
        fields: [{ name: "name", label: "Name", required: true }, { name: "role", label: "Role", required: true }],
        onSubmit: async function (values) {
          const list = (charter.stakeholders || []).slice();
          if (index >= 0) list[index] = values; else list.push(values);
          return app.update("charter", charter.id, { stakeholders: list });
        }
      });
    } else if (action === "remove-stakeholder") {
      const index = Number(id);
      if (!window.confirm("Remove this stakeholder from the charter?")) return;
      await app.update("charter", charter.id, { stakeholders: charter.stakeholders.filter(function (_, position) { return position !== index; }) });
      app.toast("Stakeholder removed.");
      app.refresh();
    } else if (action === "edit-plan") {
      const plan = app.getAll("plans")[0];
      app.openForm({
        title: "Edit project management plan", initial: plan,
        fields: [
          { name: "scope", label: "Scope management", type: "textarea", required: true },
          { name: "schedule", label: "Schedule management", type: "textarea", required: true },
          { name: "cost", label: "Cost management", type: "textarea", required: true },
          { name: "quality", label: "Quality management", type: "textarea", required: true }
        ],
        onSubmit: function (values) { return app.update("plans", plan.id, values); }
      });
    } else if (action === "add-milestone" || action === "edit" && lookup(milestones)) {
      const milestone = action === "edit" ? lookup(milestones) : null;
      app.openForm({
        title: milestone ? "Edit milestone" : "Add milestone", initial: milestone || {},
        fields: [
          { name: "name", label: "Milestone name", required: true },
          { name: "dueDate", label: "Due date", type: "date", required: true },
          { name: "status", label: "Status", type: "select", options: ["Not Started", "In Progress", "Completed"], required: true }
        ],
        validate: function (values) {
          return root.ProjectValidation.uniqueName(values.name, milestones, milestone && milestone.id, "name") ? "" : "Milestone names must be unique.";
        },
        onSubmit: function (values) {
          if (milestone) return app.update("milestones", milestone.id, values);
          return app.add("milestones", values);
        }
      });
    } else if (action === "delete" && lookup(milestones)) {
      if (!window.confirm("Delete this milestone?")) return;
      await app.remove("milestones", id);
      app.toast("Milestone deleted.");
      app.refresh();
    } else if (action === "add-team" || action === "edit" && lookup(team)) {
      const member = action === "edit" ? lookup(team) : null;
      app.openForm({
        title: member ? "Edit team member" : "Add team member", initial: member || {},
        fields: [
          { name: "name", label: "Team member", required: true },
          { name: "role", label: "Role", required: true },
          { name: "responsibility", label: "Responsibility", type: "textarea", required: true, full: true }
        ],
        validate: function (values) {
          if (!root.ProjectValidation.uniqueName(values.name, team, member && member.id, "name")) return "Team member names must be unique.";
          return "";
        },
        onSubmit: function (values) {
          if (member) return app.update("team", member.id, values);
          return app.add("team", values);
        }
      });
    } else if (action === "delete" && lookup(team)) {
      const person = lookup(team);
      const referenced = app.getAll("activities").some(function (item) { return item.assigneeId === id; }) ||
        app.getAll("defects").some(function (item) { return item.assigneeId === id; }) ||
        app.getAll("inspections").some(function (item) { return item.testerId === id; });
      if (referenced) {
        app.toast("This team member is assigned to project work and cannot be deleted.", true);
        return;
      }
      if (!window.confirm("Delete " + person.name + " from the project team?")) return;
      await app.remove("team", id);
      app.toast("Team member deleted.");
      app.refresh();
    } else if (action === "edit-closure") {
      const closure = app.getAll("closure")[0];
      app.openForm({
        title: closure ? "Edit project closure record" : "Create project closure record",
        initial: closure || {},
        fields: [
          { name: "lessonsLearned", label: "Lessons learned", type: "textarea", required: true, full: true },
          { name: "finalCost", label: "Final cost (PKR)", type: "number", min: 0, step: 1, required: true },
          { name: "completionDate", label: "Completion date", type: "date", required: true },
          { name: "signOffStatus", label: "Sign-off status", type: "select", options: ["Pending", "Approved", "Rejected"], required: true }
        ],
        validate: function (values) {
          return root.ProjectValidation.dateOrder(app.getAll("charter")[0].startDate, values.completionDate)
            ? "" : "Completion date cannot be before the project start date.";
        },
        onSubmit: function (values) {
          if (closure) return app.update("closure", closure.id, values);
          return app.add("closure", values);
        }
      });
    }
  }

  app.register("initiation", { render: render });
}(window));
