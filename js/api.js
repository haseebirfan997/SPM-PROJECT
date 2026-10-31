(function (root) {
  "use strict";

  const collections = [
    "milestones", "teamMembers", "requirements", "wbsNodes", "changeRequests",
    "activities", "defects", "checklists", "inspections", "risks", "pdpcNodes", "settings"
  ];
  const cache = Object.create(null);
  const derived = Object.create(null);
  let projectId = "";

  function toDate(value) {
    return value ? new Date(value).toISOString().slice(0, 10) : "";
  }

  async function request(path, options) {
    let response;
    try {
      response = await fetch("/api" + path, Object.assign({
        headers: { "Content-Type": "application/json" }
      }, options || {}));
    } catch (error) {
      throw new Error("Cannot reach the project server. Start the backend and refresh this page.");
    }
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error("The project server returned an unreadable response.");
    }
    if (!response.ok || !payload.success) {
      const detail = Array.isArray(payload.errors) && payload.errors.length ? " " + payload.errors.join(" ") : "";
      throw new Error((payload.message || "The project server could not complete this request.") + detail);
    }
    return payload.data;
  }

  function fromServer(table, record) {
    if (!record) return record;
    const row = Object.assign({}, record);
    if (table === "team") row.id = row.id || row._id;
    if (table === "charter") {
      row.objectives = Array.isArray(row.objectives) ? row.objectives.join("\n") : row.objectives || "";
      row.inScope = Array.isArray(row.scopeIn) ? row.scopeIn.join("\n") : row.inScope || "";
      row.outOfScope = Array.isArray(row.scopeOut) ? row.scopeOut.join("\n") : row.outOfScope || "";
      row.startDate = toDate(row.startDate);
      row.deadline = toDate(row.deadline);
      row.originalDeadline = toDate(row.originalDeadline);
      row.stakeholders = row.stakeholders || [];
    } else if (table === "plans") {
      row.id = row.id || row._id;
    } else if (table === "closure") {
      row.signOffStatus = row.signOff || row.signOffStatus || "Pending";
      row.completionDate = toDate(row.completionDate);
    } else if (table === "milestones") {
      row.dueDate = toDate(row.dueDate);
    } else if (table === "activities") {
      row.duration = row.durationDays;
      row.startDate = toDate(row.startDate);
      row.endDate = toDate(row.endDate);
    } else if (table === "changeRequests") {
      row.scheduleImpact = row.scheduleImpactWeeks;
      row.requirementId = row.requirementId || (row.requirementIds && row.requirementIds[0]) || "";
      row.costImpact = Number(row.costImpact);
    } else if (table === "defects") {
      row.dateReported = toDate(row.dateReported);
      row.resolvedDate = toDate(row.resolvedDate);
    } else if (table === "checklists") {
      row.items = (row.items || []).map(function (item) {
        return { id: item.id || item._id, label: item.text, done: item.checked };
      });
    } else if (table === "inspections") {
      row.name = row.testName;
      row.date = toDate(row.date);
    } else if (table === "risks") {
      const parts = String(row.description || "").split("\n");
      row.preventiveAction = parts[0] ? parts[0].replace(/^Preventive action:\s*/i, "") : "";
      row.contingencyAction = parts[1] ? parts[1].replace(/^Contingency action:\s*/i, "") : "";
    } else if (table === "settings") {
      row.statusDate = toDate(row.statusDate);
    } else if (table === "requirements" && row.changeRequestId) {
      row.changeRequestId = String(row.changeRequestId);
    }
    return row;
  }

  function flattenPdpc(nodes) {
    const byId = new Map(nodes.map(function (node) { return [String(node.id), node]; }));
    const children = new Map();
    nodes.forEach(function (node) {
      if (!node.parentId) return;
      const parentId = String(node.parentId);
      if (!children.has(parentId)) children.set(parentId, []);
      children.get(parentId).push(node);
    });
    return nodes.filter(function (node) { return node.type === "Risk"; }).map(function (risk) {
      const parent = byId.get(String(risk.parentId));
      const preventive = (children.get(String(risk.id)) || []).find(function (child) { return child.type === "Preventive"; });
      const corrective = preventive && (children.get(String(preventive.id)) || []).find(function (child) { return child.type === "Corrective"; });
      return {
        id: risk.id, objective: parent ? parent.text : "",
        risk: risk.text, preventiveAction: preventive ? preventive.text : "",
        contingencyAction: corrective ? corrective.text : ""
      };
    });
  }

  function toServer(table, values) {
    const body = Object.assign({}, values);
    ["id", "_id", "__v", "createdAt", "updatedAt", "requirementId"].forEach(function (key) { delete body[key]; });
    if (table === "charter") {
      body.objectives = String(body.objectives || "").split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
      body.scopeIn = String(body.inScope || "").split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
      body.scopeOut = String(body.outOfScope || "").split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
      delete body.inScope;
      delete body.outOfScope;
    } else if (table === "activities") {
      body.durationDays = Number(body.duration);
      delete body.duration;
    } else if (table === "changeRequests") {
      body.scheduleImpactWeeks = Number(body.scheduleImpact);
      delete body.scheduleImpact;
      if (values.requirementId) body.requirementIds = [values.requirementId];
    } else if (table === "checklists") {
      body.items = (body.items || []).map(function (item) {
        return { ...(item.id ? { _id: item.id } : {}), text: item.label, checked: Boolean(item.done) };
      });
    } else if (table === "inspections") {
      body.testName = body.name;
      delete body.name;
    } else if (table === "risks") {
      body.description = "Preventive action: " + String(body.preventiveAction || "") +
        "\nContingency action: " + String(body.contingencyAction || "");
      delete body.preventiveAction;
      delete body.contingencyAction;
    } else if (table === "closure") {
      body.signOff = body.signOffStatus || body.signOff || "Pending";
      delete body.signOffStatus;
    } else if (table === "requirements" && !body.changeRequestId) {
      delete body.changeRequestId;
    }
    return body;
  }

  function collectionFor(table) {
    return table === "team" ? "teamMembers" : table === "pdpc" ? "pdpcNodes" : table;
  }

  function urlFor(table, suffix) {
    return "/" + collectionFor(table) + (suffix || "") + (projectId ? "?projectId=" + encodeURIComponent(projectId) : "");
  }

  async function loadCache() {
    const projects = await request("/projects");
    if (!projects.length) throw new Error("No project data is available. Run `npm run seed` and refresh the page.");
    const project = projects[0];
    projectId = project.id;
    cache.charter = [fromServer("charter", project)];
    cache.plans = project.plan ? [fromServer("plans", Object.assign({ id: project.id }, project.plan))] : [];
    cache.closure = project.closure ? [fromServer("closure", Object.assign({ id: project.id }, project.closure))] : [];
    await Promise.all(collections.map(async function (collection) {
      const rows = await request("/" + collection + "?projectId=" + encodeURIComponent(projectId));
      const table = collection === "teamMembers" ? "team" : collection === "pdpcNodes" ? "pdpc" : collection;
      cache[table] = collection === "pdpcNodes" ? flattenPdpc(rows) :
        rows.map(function (row) { return fromServer(table, row); });
    }));
    const [dashboard, evm, evmByActivity, schedule, delays, consistency, approved, wbs, rankedRisks, riskMatrix, defectSummary, pdpcTree] = await Promise.all([
      request("/dashboard?projectId=" + encodeURIComponent(projectId)),
      request("/evm?projectId=" + encodeURIComponent(projectId)),
      request("/evm/by-activity?projectId=" + encodeURIComponent(projectId)),
      request("/schedule?projectId=" + encodeURIComponent(projectId)),
      request("/schedule/delays?projectId=" + encodeURIComponent(projectId)),
      request("/consistency?projectId=" + encodeURIComponent(projectId)),
      request("/scope/approved?projectId=" + encodeURIComponent(projectId)),
      request("/wbs/tree?projectId=" + encodeURIComponent(projectId)),
      request("/risks/ranked?projectId=" + encodeURIComponent(projectId)),
      request("/risks/matrix?projectId=" + encodeURIComponent(projectId)),
      request("/defects/summary?projectId=" + encodeURIComponent(projectId)),
      request("/pdpc/tree?projectId=" + encodeURIComponent(projectId))
    ]);
    derived.dashboard = dashboard;
    derived.evm = evm;
    derived.evmByActivity = evmByActivity;
    derived.schedule = schedule;
    derived.delays = delays;
    derived.consistency = consistency;
    derived.approved = approved.map(function (row) { return fromServer("requirements", row); });
    derived.wbs = wbs;
    derived.rankedRisks = rankedRisks;
    derived.riskMatrix = riskMatrix;
    derived.defectSummary = defectSummary;
    derived.pdpcTree = pdpcTree;
  }

  function getAll(table) {
    return (cache[table] || []).slice();
  }

  function getById(table, id) {
    return getAll(table).find(function (row) { return String(row.id) === String(id); }) || null;
  }

  async function createPdpcBranch(values) {
    const roots = await request("/pdpcNodes?projectId=" + encodeURIComponent(projectId));
    let rootNode = roots.find(function (node) { return node.type === "Objective" && node.text === values.objective; });
    if (!rootNode) rootNode = await request("/pdpcNodes?projectId=" + encodeURIComponent(projectId), {
      method: "POST", body: JSON.stringify({ type: "Objective", text: values.objective })
    });
    const riskNode = await request("/pdpcNodes?projectId=" + encodeURIComponent(projectId), {
      method: "POST", body: JSON.stringify({ type: "Risk", text: values.risk, parentId: rootNode.id })
    });
    const preventive = await request("/pdpcNodes?projectId=" + encodeURIComponent(projectId), {
      method: "POST", body: JSON.stringify({ type: "Preventive", text: values.preventiveAction, parentId: riskNode.id })
    });
    await request("/pdpcNodes?projectId=" + encodeURIComponent(projectId), {
      method: "POST", body: JSON.stringify({ type: "Corrective", text: values.contingencyAction, parentId: preventive.id })
    });
    return {
      id: riskNode.id, objective: values.objective, risk: values.risk,
      preventiveAction: values.preventiveAction, contingencyAction: values.contingencyAction
    };
  }

  async function add(table, values) {
    let record;
    if (table === "charter") {
      throw new Error("Project charter creation is not supported by this single-project workspace.");
    }
    if (table === "plans" || table === "closure") {
      const project = await request("/projects/" + projectId + "?projectId=" + encodeURIComponent(projectId));
      const body = table === "plans" ? { plan: values } : { closure: toServer(table, values) };
      record = await request("/projects/" + projectId + "?projectId=" + encodeURIComponent(projectId), {
        method: "PUT", body: JSON.stringify(Object.assign({}, project, body))
      });
      record = table === "plans" ? fromServer("plans", Object.assign({ id: record.id }, record.plan)) : fromServer("closure", Object.assign({ id: record.id }, record.closure));
    } else if (table === "changeRequests") {
      const result = await request("/changeRequests?projectId=" + encodeURIComponent(projectId), {
        method: "POST", body: JSON.stringify(toServer(table, values))
      });
      const requirement = await request("/requirements?projectId=" + encodeURIComponent(projectId), {
        method: "POST",
        body: JSON.stringify({
          title: values.title, description: values.description, priority: "High", status: "Proposed",
          changeRequestId: result.id
        })
      });
      const linkedRequest = await request("/changeRequests/" + encodeURIComponent(result.id) + "?projectId=" + encodeURIComponent(projectId), {
        method: "PUT", body: JSON.stringify({ requirementIds: [requirement.id] })
      });
      record = fromServer(table, Object.assign({}, linkedRequest, { requirementId: requirement.id }));
      const index = cache.requirements.findIndex(function (item) { return item.id === requirement.id; });
      if (index < 0) cache.requirements.push(fromServer("requirements", requirement));
    } else if (table === "pdpc") {
      record = await createPdpcBranch(values);
    } else {
      const result = await request(urlFor(table), { method: "POST", body: JSON.stringify(toServer(table, values)) });
      record = fromServer(table, result);
    }
    if (!cache[table]) cache[table] = [];
    cache[table].push(record);
    return record;
  }

  async function update(table, id, values) {
    let record;
    if (table === "charter" || table === "plans" || table === "closure") {
      const currentProject = await request("/projects/" + projectId + "?projectId=" + encodeURIComponent(projectId));
      const body = table === "charter" ? toServer(table, values)
        : table === "plans" ? { plan: Object.assign({}, currentProject.plan, values) }
          : { closure: Object.assign({}, currentProject.closure || {}, toServer(table, values)) };
      const result = await request("/projects/" + projectId + "?projectId=" + encodeURIComponent(projectId), {
        method: "PUT", body: JSON.stringify(Object.assign({}, currentProject, body))
      });
      if (table === "charter") record = fromServer(table, result);
      else if (table === "plans") record = fromServer(table, Object.assign({ id: result.id }, result.plan));
      else record = fromServer(table, Object.assign({ id: result.id }, result.closure));
    } else if (table === "pdpc") {
      record = await updatePdpcBranch(id, values);
    } else {
      const result = await request(urlFor(table, "/" + encodeURIComponent(id)), {
        method: "PUT", body: JSON.stringify(toServer(table, values))
      });
      record = fromServer(table, result);
    }
    const rows = cache[table] || [];
    const index = rows.findIndex(function (row) { return String(row.id) === String(id); });
    if (index >= 0) rows[index] = Object.assign({}, rows[index], record);
    else rows.push(record);
    return record;
  }

  async function updatePdpcBranch(id, values) {
    const [roots] = await Promise.all([request("/pdpcNodes?projectId=" + encodeURIComponent(projectId))]);
    const root = roots.find(function (node) { return node.type === "Objective" && node.text === values.objective; });
    const existingRisk = roots.find(function (node) { return node.id === id; });
    if (!existingRisk) throw new Error("The PDPC branch could not be found.");
    let rootNode = root;
    if (!rootNode) {
      rootNode = await request("/pdpcNodes?projectId=" + encodeURIComponent(projectId), {
        method: "POST", body: JSON.stringify({ type: "Objective", text: values.objective })
      });
    }
    await request("/pdpcNodes/" + encodeURIComponent(existingRisk.id) + "?projectId=" + encodeURIComponent(projectId), {
      method: "PUT", body: JSON.stringify({ type: "Risk", text: values.risk, parentId: rootNode.id })
    });
    const children = await request("/pdpcNodes?projectId=" + encodeURIComponent(projectId));
    const preventive = children.find(function (node) { return node.type === "Preventive" && String(node.parentId) === String(id); });
    if (preventive) {
      await request("/pdpcNodes/" + encodeURIComponent(preventive.id) + "?projectId=" + encodeURIComponent(projectId), {
        method: "PUT", body: JSON.stringify({ text: values.preventiveAction })
      });
      const corrective = children.find(function (node) { return node.type === "Corrective" && String(node.parentId) === String(preventive.id); });
      if (corrective) await request("/pdpcNodes/" + encodeURIComponent(corrective.id) + "?projectId=" + encodeURIComponent(projectId), {
        method: "PUT", body: JSON.stringify({ text: values.contingencyAction })
      });
    }
    return fromServer("pdpc", Object.assign({}, existingRisk, values));
  }

  async function remove(table, id) {
    if (table === "plans" || table === "closure") {
      const project = await request("/projects/" + projectId + "?projectId=" + encodeURIComponent(projectId));
      const property = table === "plans" ? "plan" : "closure";
      const body = Object.assign({}, project, { [property]: null });
      await request("/projects/" + projectId + "?projectId=" + encodeURIComponent(projectId), { method: "PUT", body: JSON.stringify(body) });
    } else if (table === "pdpc") {
      const nodes = await request("/pdpcNodes?projectId=" + encodeURIComponent(projectId));
      const targets = new Set([String(id)]);
      let changed = true;
      while (changed) {
        changed = false;
        nodes.forEach(function (node) {
          if (node.parentId && targets.has(String(node.parentId)) && !targets.has(String(node.id))) {
            targets.add(String(node.id));
            changed = true;
          }
        });
      }
      for (const targetId of Array.from(targets).reverse()) {
        await request("/pdpcNodes/" + encodeURIComponent(targetId) + "?projectId=" + encodeURIComponent(projectId), { method: "DELETE" });
      }
    } else {
      await request(urlFor(table, "/" + encodeURIComponent(id)), { method: "DELETE" });
      if (table === "changeRequests") {
        const linked = cache.requirements.find(function (item) { return item.changeRequestId === id; });
        if (linked) {
          await request("/requirements/" + encodeURIComponent(linked.id) + "?projectId=" + encodeURIComponent(projectId), { method: "DELETE" });
          cache.requirements = cache.requirements.filter(function (item) { return item.id !== linked.id; });
        }
      }
    }
    cache[table] = (cache[table] || []).filter(function (row) { return String(row.id) !== String(id); });
  }

  async function approveChangeRequest(id) {
    const result = await request("/change-requests/" + encodeURIComponent(id) + "/approve?projectId=" + encodeURIComponent(projectId), { method: "POST" });
    await loadCache();
    return result;
  }

  async function rejectChangeRequest(id) {
    const result = await request("/change-requests/" + encodeURIComponent(id) + "/reject?projectId=" + encodeURIComponent(projectId), { method: "POST" });
    await loadCache();
    return result;
  }

  async function refreshDerived() {
    await loadCache();
    return derived;
  }

  root.ProjectAPI = Object.freeze({
    bootstrap: loadCache, refresh: refreshDerived, getAll: getAll, getById: getById,
    add: add, update: update, remove: remove,
    approveChangeRequest: approveChangeRequest, rejectChangeRequest: rejectChangeRequest,
    getEvm: function (statusDate) { return request("/evm" + (statusDate ? "?statusDate=" + statusDate : "")); },
    getSchedule: function () { return request("/schedule"); },
    getDelays: function (statusDate) { return request("/schedule/delays" + (statusDate ? "?statusDate=" + statusDate : "")); },
    getDashboard: function () { return request("/dashboard"); },
    getConsistency: function () { return request("/consistency"); },
    getRankedRisks: function () { return request("/risks/ranked"); },
    getRiskMatrix: function () { return request("/risks/matrix"); },
    getPdpcTree: function () { return request("/pdpc/tree"); },
    getDefectSummary: function () { return request("/defects/summary"); },
    getCostSummary: function () { return request("/cost/summary"); },
    getApprovedScope: function () { return request("/scope/approved"); },
    getWbsTree: function () { return request("/wbs/tree"); },
    generateWbs: function () { return request("/wbs/generate", { method: "POST" }); },
    getReport: function () { return request("/report"); },
    getDerived: function (name) { return derived[name]; },
    getProjectId: function () { return projectId }
  });
}(window));
