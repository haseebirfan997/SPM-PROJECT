(function (root) {
  "use strict";

  const app = root.App;
  const priorities = ["High", "Medium", "Low"];
  const requirementStatuses = ["Proposed", "Approved", "Rejected"];
  function getData() {
    return {
      charter: app.getAll("charter")[0],
      requirements: app.getAll("requirements"),
      changes: app.getAll("changeRequests")
    };
  }

  function render(target) {
    const data = getData();
    const approved = data.requirements.filter(function (item) { return item.status === "Approved"; });
    const allRequirements = data.requirements;
    const tree = root.ProjectAPI.getDerived("wbs");
    const effectiveBudget = Number(data.charter.approvedBudget);
    const baseDuration = Math.max(1, Math.round((Date.parse(data.charter.originalDeadline) - Date.parse(data.charter.startDate)) / 604800000));
    const currentDuration = Math.max(1, Math.round((Date.parse(data.charter.deadline) - Date.parse(data.charter.startDate)) / 604800000));
    const wbs = (tree || []).map(function (project, projectIndex) {
      return '<div class="wbs-deliverable"><div class="wbs-parent"><span class="tree-number">' + (projectIndex + 1) +
        "</span>" + app.escape(project.name) + "</div>" + (project.children || []).map(function (deliverable, index) {
          const workPackages = (deliverable.children || []).map(function (node) {
            const requirementId = node.requirementId;
            return '<div class="wbs-child"><span>' + app.escape(node.name) +
              '</span><span class="actions-cell">' + app.button("Edit", "edit-wbs", requirementId) +
              app.button("Remove", "remove-wbs", requirementId, "button-danger") + "</span></div>";
          }).join("");
          return '<div class="wbs-deliverable"><div class="wbs-parent"><span class="tree-number">' +
            (projectIndex + 1) + "." + (index + 1) + "</span>" + app.escape(deliverable.name) +
            '<span class="muted">(' + (deliverable.children || []).length + " work packages)</span></div>" + workPackages + "</div>";
        }).join("") + "</div>";
    }).join("");

    target.innerHTML = app.heading("DELIVERY SCOPE", "Scope management & WBS",
      "Control requirements, approved scope and change requests for the five-hospital rollout.",
      app.button("+ Add requirement", "add-requirement", "new", "button")) +
      '<div class="grid grid-3" style="margin-bottom:15px">' +
      '<div class="impact-value"><small>Approved baseline budget</small><strong>' + app.money(data.charter.originalBudget) + "</strong></div>" +
      '<div class="impact-value"><small>Current approved budget</small><strong>' + app.money(effectiveBudget) + "</strong></div>" +
      '<div class="impact-value"><small>Approved delivery duration</small><strong>' + baseDuration + " → " + currentDuration + " weeks</strong></div></div>" +
      app.card("Approved change impact", '<div class="impact-grid"><div class="impact-value"><small>Before · project baseline</small><strong>' +
        app.money(data.charter.originalBudget) + '</strong><small style="margin-top:5px">' + baseDuration +
        " weeks · deadline " + app.date(data.charter.originalDeadline) + '</small></div><span class="impact-arrow">→</span>' +
        '<div class="impact-value"><small>After · approved changes only</small><strong>' + app.money(effectiveBudget) +
        '</strong><small style="margin-top:5px">' + currentDuration + " weeks · deadline " + app.date(data.charter.deadline) +
        "</small></div></div><p class=\"page-subtitle\" style=\"margin:12px 0 0\">Approved scope: " + approved.length +
        " requirements. Pending and rejected requirements are excluded from the WBS and baseline totals.</p>", {
        description: "Budget, duration and scope recalculate when a change request is approved"
      }) +
      '<div class="section-kicker">Requirements register</div>' +
      app.card("Requirements", app.table(["Requirement", "Priority", "Status", "Change request", "Actions"], allRequirements.map(function (item) {
        const change = item.changeRequestId && data.changes.find(function (request) { return request.id === item.changeRequestId; });
        return "<tr><td><strong>" + app.escape(item.title) + '</strong><span class="table-sub">' + app.escape(item.description) +
          "</span></td><td>" + app.badge(item.priority) + "</td><td>" + app.badge(item.status) + "</td><td>" +
          (change ? app.escape(change.title) + "<span class=\"table-sub\">" + app.badge(change.status) + "</span>" : "—") +
          "</td><td>" + app.editDelete(item.id) + "</td></tr>";
      })), { description: "Only approved requirements are included in the project WBS." }) +
      '<div class="section-kicker">Work breakdown structure</div>' +
      app.card("Approved scope WBS", wbs
        ? '<div class="wbs-tree"><div class="wbs-parent"><span class="tree-number">1</span>Smart Healthcare PMIS <span class="muted">(' + approved.length + " approved work packages)</span></div>" +
          wbs + "</div>"
        : app.empty("There are no approved requirements to include in the WBS."), {
        description: "Project > Deliverables > Work packages; each work package is generated from an approved requirement.",
        action: app.button("+ Add work package", "add-wbs", "new")
      }) +
      '<div class="section-kicker">Change control</div>' +
      app.card("Change requests", app.table(["Request", "Impact", "Status", "Actions"], data.changes.map(function (request) {
        const approvalActions = request.status === "Pending"
          ? app.button("Approve", "approve-change", request.id, "button") + app.button("Reject", "reject-change", request.id, "button-danger")
          : "";
        return "<tr><td><strong>" + app.escape(request.title) + '</strong><span class="table-sub">' + app.escape(request.justification) +
          "</span></td><td>" + app.money(request.costImpact) + " · +" + Number(request.scheduleImpact) + " weeks</td><td>" +
          app.badge(request.status) + "</td><td><div class=\"actions-cell\">" + app.button("Edit", "edit-change", request.id) +
          approvalActions + '<button class="button button-danger button-small" data-action="delete-change" data-id="' +
          app.escape(request.id) + '">Delete</button></div></td></tr>';
      })), {
        description: "Approval adds the linked requirement to scope and applies the cost and schedule impacts.",
        action: app.button("+ Add change request", "add-change", "new")
      });

    target.querySelectorAll("[data-action]").forEach(function (element) {
      element.addEventListener("click", function () {
        Promise.resolve(handleAction(element.dataset.action, element.dataset.id)).catch(function (error) { app.toast(error.message, true); });
      });
    });
  }

  function requirementForm(requirement, defaultStatus) {
    const data = getData();
    const isEdit = Boolean(requirement);
    const linked = isEdit && requirement.changeRequestId
      ? data.changes.find(function (request) { return request.id === requirement.changeRequestId; })
      : null;
    app.openForm({
      title: isEdit ? "Edit requirement" : "Add requirement",
      initial: requirement || { status: defaultStatus || "Proposed", priority: "Medium" },
      fields: [
        { name: "title", label: "Requirement", required: true, full: true },
        { name: "description", label: "Description", type: "textarea", required: true, full: true },
        { name: "priority", label: "Priority", type: "select", options: priorities, required: true },
        { name: "status", label: "Status", type: "select", options: requirementStatuses, required: true }
      ],
      validate: function (values) {
        if (!root.ProjectValidation.uniqueName(values.title, data.requirements, requirement && requirement.id, "title")) {
          return "Requirement names must be unique.";
        }
        if (linked && linked.status !== "Approved" && values.status === "Approved") {
          return "Approve the linked change request before approving this requirement.";
        }
        if (linked && linked.status === "Approved" && values.status !== "Approved") {
          return "This requirement is part of an approved change request and cannot be removed from approved scope.";
        }
        return "";
      },
      onSubmit: function (values) {
        values.changeRequestId = requirement ? requirement.changeRequestId || "" : "";
        if (requirement) return app.update("requirements", requirement.id, values);
        return app.add("requirements", values);
      }
    });
  }

  function changeForm(request) {
    const changes = app.getAll("changeRequests");
    app.openForm({
      title: request ? "Edit change request" : "Add change request",
      initial: request || { status: "Pending", costImpact: 0, scheduleImpact: 0 },
      fields: [
        { name: "title", label: "Request title", required: true, full: true },
        { name: "description", label: "Description", type: "textarea", required: true, full: true },
        { name: "justification", label: "Justification", type: "textarea", required: true, full: true },
        { name: "costImpact", label: "Cost impact (PKR)", type: "number", min: 0, step: 1, required: true },
        { name: "scheduleImpact", label: "Schedule impact (weeks)", type: "number", min: 0, step: 0.1, required: true }
      ],
      validate: function (values) {
        if (!root.ProjectValidation.uniqueName(values.title, changes, request && request.id, "title")) {
          return "Change request titles must be unique.";
        }
        if (!request && !root.ProjectValidation.uniqueName(values.title, app.getAll("requirements"), null, "title")) {
          return "A requirement with this title already exists.";
        }
        return "";
      },
      onSubmit: async function (values) {
        if (request) {
          return app.update("changeRequests", request.id, values);
        } else {
          return app.add("changeRequests", values);
        }
      }
    });
  }

  async function handleAction(action, id) {
    const requirements = app.getAll("requirements");
    const changes = app.getAll("changeRequests");
    const request = changes.find(function (item) { return item.id === id; });
    const requirement = requirements.find(function (item) { return item.id === id; });
    if (action === "add-requirement") {
      requirementForm(null);
    } else if (action === "add-wbs") {
      requirementForm(null, "Approved");
    } else if (action === "edit" && requirement || action === "edit-wbs" && requirement) {
      requirementForm(requirement);
    } else if (action === "delete" && requirement) {
      const activities = app.getAll("activities");
      const usedByActivity = activities.some(function (activity) { return activity.requirementId === id; });
      if (usedByActivity || requirement.status === "Approved") {
        app.toast("This requirement is used by the approved WBS or project work. Move it out of approved scope before deleting.", true);
        return;
      }
      if (!window.confirm("Delete the requirement " + requirement.title + "?")) return;
      await app.remove("requirements", id);
      app.toast("Requirement deleted.");
      app.refresh();
    } else if (action === "remove-wbs" && requirement) {
      if (requirement.changeRequestId) {
        app.toast("A change-request work package can only be removed by changing its request; approved change scope is protected.", true);
        return;
      }
      if (!window.confirm("Remove this work package from the approved WBS? The requirement will remain in the register as Proposed.")) return;
      await app.update("requirements", requirement.id, { status: "Proposed" });
      app.toast("Work package removed from approved scope.");
      app.refresh();
    } else if (action === "add-change") {
      changeForm(null);
    } else if (action === "edit-change" && request) {
      changeForm(request);
    } else if ((action === "approve-change" || action === "reject-change") && request) {
      const isApproval = action === "approve-change";
      if (!requirements.some(function (item) { return item.id === request.requirementId; })) {
        app.toast("The linked requirement is missing; this change request cannot be updated.", true);
        return;
      }
      if (isApproval && (request.costImpact == null || request.scheduleImpact == null ||
          !root.ProjectValidation.nonNegative(request.costImpact) || !root.ProjectValidation.nonNegative(request.scheduleImpact))) {
        app.toast("A change request needs valid cost and schedule impacts before approval.", true);
        return;
      }
      if (!window.confirm((isApproval ? "Approve" : "Reject") + " this change request?")) return;
      if (isApproval) await root.ProjectAPI.approveChangeRequest(id);
      else await root.ProjectAPI.rejectChangeRequest(id);
      await root.ProjectAPI.refresh();
      app.toast(isApproval ? "Change approved. Budget, deadline and approved scope have been updated." : "Change rejected. Its requirement remains outside approved scope.");
      app.refresh();
    } else if (action === "delete-change" && request) {
      if (request.status === "Approved") {
        app.toast("An approved change request cannot be deleted because its impact is part of the approved baseline.", true);
        return;
      }
      if (app.getAll("activities").some(function (activity) { return activity.requirementId === request.requirementId; })) {
        app.toast("The linked requirement is in use by project work and cannot be deleted.", true);
        return;
      }
      if (!window.confirm("Delete this change request? Its linked requirement will also be removed.")) return;
      await app.remove("changeRequests", id);
      app.toast("Change request deleted.");
      app.refresh();
    }
  }

  app.register("scope", { render: render });
}(window));
