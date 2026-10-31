(function (root) {
  "use strict";

  const app = root.App;
  const today = function () { return new Date().toISOString().slice(0, 10); };
  const dateOnly = function (value) { return String(value || "").slice(0, 10); };
  const dayDiff = function (start, end) {
    return Math.round((Date.parse(dateOnly(end) + "T00:00:00Z") - Date.parse(dateOnly(start) + "T00:00:00Z")) / 86400000);
  };
  const addDays = function (value, days) {
    return new Date(Date.parse(dateOnly(value) + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
  };

  function render(target) {
    const activities = app.getAll("activities");
    const team = app.getAll("team");
    const charter = app.getAll("charter")[0];
    const milestones = app.getAll("milestones");
    const effectiveDeadline = charter.deadline;
    const scheduleData = root.ProjectAPI.getDerived("schedule");
    const delayData = root.ProjectAPI.getDerived("delays");
    const delayedById = new Map(delayData.allActivities.map(function (item) { return [item.id, item]; }));
    const computed = {
      activities: scheduleData.activities.map(function (item) {
        const activity = activities.find(function (record) { return record.id === item.id; });
        const delay = delayedById.get(item.id) || {};
        return Object.assign({}, activity, item, {
          earliestStart: dateOnly(item.earliestStart), earliestFinish: dateOnly(item.earliestFinish),
          projectedStart: dateOnly(delay.projectedStart || item.earliestStart),
          projectedFinish: dateOnly(delay.projectedFinish || item.earliestFinish),
          delayDays: delay.propagatedDelayDays || 0, isDelayed: Boolean(delay.delayed)
        });
      }),
      projectedFinish: dateOnly(delayData.projectedProjectFinish || scheduleData.projectedProjectFinish),
      deadlineImpact: delayData.finalDeadlineImpactDays
    };
    const byId = new Map(activities.map(function (item) { return [item.id, item]; }));
    const memberName = function (id) {
      const person = team.find(function (member) { return member.id === id; });
      return person ? person.name : "Unassigned";
    };
    const dependencyNames = function (ids) {
      return (ids || []).map(function (id) { return byId.get(id) ? byId.get(id).name : "Missing activity"; }).join(", ") || "—";
    };
    const tableRows = computed.activities.map(function (item) {
      const state = item.percentComplete === 100 ? "Completed" : item.isDelayed ? "Delayed" : "In Progress";
      return "<tr><td><strong>" + app.escape(item.name) + '<span class="table-sub">' + app.escape(dependencyNames(item.predecessors)) +
        "</span></strong></td><td>" + app.escape(memberName(item.assigneeId)) + "</td><td>" + Number(item.duration) +
        " days</td><td>" + app.date(item.earliestStart) + "</td><td>" + app.date(item.projectedFinish) +
        "</td><td><div class=\"progress-track\" style=\"width:70px\"><div class=\"progress-fill " +
        (item.isDelayed ? "red" : "") + '" style="width:' + Math.max(0, Math.min(100, Number(item.percentComplete))) +
        '%"></div></div><span class="table-sub">' + Number(item.percentComplete) + "% complete</span></td><td>" +
        app.badge(state) + (item.delayDays ? '<span class="table-sub">+' + item.delayDays + " days</span>" : "") +
        "</td><td>" + app.editDelete(item.id) + "</td></tr>";
    });
    const minDate = activities.reduce(function (min, activity) {
      return activity.startDate < min ? activity.startDate : min;
    }, charter.startDate);
    const maxDate = computed.activities.reduce(function (max, item) {
      return item.projectedFinish > max ? item.projectedFinish : max;
    }, effectiveDeadline);
    const span = Math.max(1, dayDiff(minDate, maxDate) + 1);
    const todayPercent = dayDiff(minDate, today()) / span * 100;
    const milestonesSorted = milestones.slice().sort(function (a, b) { return a.dueDate.localeCompare(b.dueDate); });
    const ganttRows = computed.activities.map(function (item) {
      const left = Math.max(0, dayDiff(minDate, item.projectedStart) / span * 100);
      const forecastDuration = dayDiff(item.projectedStart, item.projectedFinish) + 1;
      const width = Math.min(100 - left, Math.max(.8, (forecastDuration / span) * 100));
      const dependencyLabel = item.predecessors && item.predecessors.length
        ? '<span class="gantt-dependency" title="Depends on: ' + app.escape(dependencyNames(item.predecessors)) + '">↳ ' + item.predecessors.length + "</span>"
        : "";
      return '<div class="gantt-row"><div class="gantt-label" title="' + app.escape(item.name) + '">' +
        app.escape(item.name) + dependencyLabel + '</div><div class="gantt-timeline">' +
        (todayPercent >= 0 && todayPercent <= 100 ? '<i class="gantt-today" style="left:' + todayPercent.toFixed(2) + '%"></i>' : "") +
        '<div class="gantt-bar ' + (item.percentComplete === 100 ? "complete" : item.isDelayed ? "delayed" : "") +
        '" style="left:' + left.toFixed(2) + "%;width:" + width.toFixed(2) + '%" title="' +
        app.escape(item.name + ": " + app.date(item.projectedStart) + " – " + app.date(item.projectedFinish)) + '"></div></div></div>';
    }).join("");
    const weeklyLabels = Array.from({ length: 7 }, function (_, index) {
      const labelDate = addDays(minDate, Math.round(span * index / 6));
      return '<span>' + app.date(labelDate) + "</span>";
    }).join("");
    const milestoneMarkers = milestonesSorted.filter(function (milestone) {
      return milestone.dueDate >= minDate && milestone.dueDate <= maxDate;
    }).map(function (milestone) {
      const position = dayDiff(minDate, milestone.dueDate) / span * 100;
      return '<i class="gantt-milestone" style="left:' + position.toFixed(2) + '%" title="' +
        app.escape(milestone.name + " · " + app.date(milestone.dueDate)) + '"></i>';
    }).join("");
    const delayText = computed.deadlineImpact > 0
      ? "+" + computed.deadlineImpact + " days"
      : computed.projectedFinish <= effectiveDeadline ? "On track" : "No forecast";
    const delayClass = computed.deadlineImpact > 0 ? "danger" : "success";

    target.innerHTML = app.heading("DELIVERY TIMELINE", "Schedule & resource management",
      "Model activity dependencies, track progress and forecast the five-hospital rollout.",
      app.button("+ Add activity", "add-activity", "new", "button")) +
      '<div class="banner ' + delayClass + '" style="margin-bottom:15px"><div><strong>Final deadline impact: ' +
      app.escape(delayText) + "</strong>Projected project finish " + app.date(computed.projectedFinish) +
      " versus approved deadline " + app.date(effectiveDeadline) + ". Delayed activity lag is carried through dependent work.</div></div>" +
      app.card("Activities", app.table(["Activity", "Assigned to", "Duration", "Earliest start", "Projected end", "Progress", "Forecast", "Actions"], tableRows), {
        description: "Earliest dates use forward-pass dependencies; forecast dates include progress and overdue delay.",
        action: app.button("+ Add activity", "add-activity", "new")
      }) +
      '<div class="section-kicker">Schedule visualization</div>' +
      app.card("Project Gantt", '<div class="gantt-legend"><span><i class="legend-dot"></i> Planned</span><span><i class="legend-dot green"></i> Completed</span><span><i class="legend-dot red"></i> Delayed</span><span><i class="gantt-today-key"></i> Today</span><span><i class="gantt-milestone-key"></i> Milestone</span></div>' +
        '<div class="table-wrap" style="margin-top:13px"><div class="gantt"><div class="gantt-head"><div>ACTIVITY</div><div class="gantt-scale">' +
        weeklyLabels + milestoneMarkers + '</div></div>' + (ganttRows || app.empty("Add activities to see the Gantt schedule.")) + "</div></div>", {
        description: "Schedule bars show dependency-adjusted dates and milestone markers.",
        action: '<span class="muted">' + app.date(minDate) + " – " + app.date(maxDate) + "</span>"
      });
    target.querySelectorAll("[data-action]").forEach(function (element) {
      element.addEventListener("click", function () {
        Promise.resolve(handleAction(element.dataset.action, element.dataset.id)).catch(function (error) { app.toast(error.message, true); });
      });
    });
  }

  function hasCircularDependency(existing, candidate, currentId) {
    const graph = existing.map(function (activity) {
      return activity.id === currentId ? Object.assign({}, activity, candidate) : activity;
    });
    if (!currentId) graph.push(Object.assign({ id: "__new_activity__" }, candidate));
    const byId = new Map(graph.map(function (activity) { return [activity.id, activity]; }));
    const visiting = new Set();
    const visited = new Set();
    function visit(id) {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      const activity = byId.get(id);
      if (activity && (activity.predecessors || []).some(function (predecessor) { return byId.has(predecessor) && visit(predecessor); })) return true;
      visiting.delete(id);
      visited.add(id);
      return false;
    }
    return graph.some(function (activity) { return visit(activity.id); });
  }

  function activityForm(activity) {
    const activities = app.getAll("activities");
    const team = app.getAll("team");
    const eligible = activities.filter(function (item) { return !activity || item.id !== activity.id; });
    app.openForm({
      title: activity ? "Edit activity" : "Add activity",
      initial: activity || { startDate: today(), duration: 1, percentComplete: 0, predecessors: [] },
      fields: [
        { name: "name", label: "Activity name", required: true, full: true },
        { name: "assigneeId", label: "Assigned team member", type: "select", options: team.map(function (person) {
          return { value: person.id, label: person.name + " · " + person.role };
        }), required: true },
        { name: "duration", label: "Estimated duration (days)", type: "number", min: 1, step: 1, required: true },
        { name: "startDate", label: "Planned start date", type: "date", required: true },
        { name: "percentComplete", label: "Percent complete", type: "number", min: 0, max: 100, step: 1, required: true },
        { name: "predecessors", label: "Predecessor activities", type: "select", multiple: true, options: eligible.map(function (item) {
          return { value: item.id, label: item.name };
        }), full: true, help: "Select one or more activities that must finish first; use Ctrl/Cmd to select multiple." }
      ],
      validate: function (values) {
        if (!root.ProjectValidation.uniqueName(values.name, activities, activity && activity.id, "name")) return "Activity names must be unique.";
        if (!values.assigneeId || !team.some(function (person) { return person.id === values.assigneeId; })) return "Select a current project team member.";
        const computedEnd = addDays(values.startDate, Number(values.duration) - 1);
        if (!root.ProjectValidation.dateOrder(values.startDate, computedEnd)) return "The end date cannot be before the start date.";
        if (hasCircularDependency(activities, values, activity && activity.id)) return "This dependency would create a circular schedule.";
        return "";
      },
      onSubmit: function (values) {
        values.endDate = addDays(values.startDate, Number(values.duration) - 1);
        values.predecessors = (values.predecessors || []).filter(function (id) { return id !== (activity && activity.id); });
        if (activity) return app.update("activities", activity.id, values);
        return app.add("activities", values);
      }
    });
  }

  async function handleAction(action, id) {
    const activities = app.getAll("activities");
    const activity = activities.find(function (item) { return item.id === id; });
    if (action === "add-activity") activityForm(null);
    else if (action === "edit" && activity) activityForm(activity);
    else if (action === "delete" && activity) {
      if (activities.some(function (item) { return (item.predecessors || []).includes(id); })) {
        app.toast("This activity is a predecessor to other work and cannot be deleted until those dependencies are changed.", true);
        return;
      }
      if (!window.confirm("Delete the activity " + activity.name + "?")) return;
      await app.remove("activities", id);
      app.toast("Activity deleted.");
      app.refresh();
    }
  }

  app.register("schedule", { render: render });
}(window));
