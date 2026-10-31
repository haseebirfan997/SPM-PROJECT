"use strict";

const { Activity, Project, ChangeRequest } = require("../models");
const { getProject } = require("./projectService");

const DAY = 86400000;
const asDate = (value) => new Date(new Date(value).toISOString().slice(0, 10) + "T00:00:00.000Z");
const plusDays = (value, days) => new Date(asDate(value).getTime() + days * DAY);
const dayDiff = (start, end) => Math.round((asDate(end) - asDate(start)) / DAY);
const sameDay = (value) => asDate(value);

function circularGraph(activities) {
  const map = new Map(activities.map((activity) => [String(activity._id || activity.id), activity]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const item = map.get(id);
    for (const predecessorId of item.predecessors || []) {
      const predecessor = String(predecessorId);
      if (map.has(predecessor) && visit(predecessor)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return Array.from(map.keys()).some(visit);
}

async function ensureAcyclic(candidate, projectId, excludeId) {
  const activities = await Activity.find({ projectId, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).lean();
  activities.push(candidate);
  if (circularGraph(activities)) {
    const error = new Error("Circular activity dependencies are not allowed.");
    error.status = 400;
    throw error;
  }
}

async function calculateSchedule(projectId) {
  const [project, activities] = await Promise.all([
    getProject(projectId),
    Activity.find({ projectId }).lean()
  ]);
  if (circularGraph(activities)) {
    const error = new Error("Circular activity dependencies detected; schedule cannot be calculated.");
    error.status = 400;
    throw error;
  }
  const deadline = plusDays(project.deadline, 0);
  const byId = new Map(activities.map((activity) => [String(activity._id), activity]));
  const forward = new Map();
  const visiting = new Set();
  function pass(id) {
    if (forward.has(id)) return forward.get(id);
    if (visiting.has(id)) throw new Error("Circular activity dependencies detected.");
    visiting.add(id);
    const activity = byId.get(id);
    const predecessors = (activity.predecessors || []).map((predecessor) => byId.has(String(predecessor)) ? pass(String(predecessor)) : null).filter(Boolean);
    const predecessorFinish = predecessors.reduce((max, item) => !max || item.earliestFinish > max ? item.earliestFinish : max, null);
    const activityStart = sameDay(activity.startDate || project.startDate);
    const earliestStart = predecessorFinish && plusDays(predecessorFinish, 1) > activityStart
      ? plusDays(predecessorFinish, 1) : activityStart;
    const result = { earliestStart, earliestFinish: plusDays(earliestStart, Math.max(0, activity.durationDays - 1)) };
    forward.set(id, result);
    visiting.delete(id);
    return result;
  }
  activities.forEach((activity) => pass(String(activity._id)));
  const projectFinish = activities.reduce((latest, activity) => {
    const finish = forward.get(String(activity._id)).earliestFinish;
    return finish > latest ? finish : latest;
  }, sameDay(project.startDate));
  const backward = new Map();
  const reverse = activities.slice().reverse();
  function back(id) {
    if (backward.has(id)) return backward.get(id);
    const activity = byId.get(id);
    const successors = activities.filter((item) => (item.predecessors || []).some((predecessor) => String(predecessor) === id));
    const latestFinish = successors.length
      ? successors.reduce((min, successor) => {
        const successorStart = back(String(successor._id)).latestStart;
        return !min || plusDays(successorStart, -1) < min ? plusDays(successorStart, -1) : min;
      }, null)
      : projectFinish;
    const latestStart = plusDays(latestFinish, -Math.max(0, activity.durationDays - 1));
    const result = { latestStart, latestFinish };
    backward.set(id, result);
    return result;
  }
  reverse.forEach((activity) => back(String(activity._id)));
  const rows = activities.map((activity) => {
    const id = String(activity._id);
    const timing = forward.get(id);
    const late = backward.get(id);
    const slack = Math.max(0, dayDiff(timing.earliestStart, late.latestStart));
    return {
      id, name: activity.name, durationDays: activity.durationDays,
      predecessors: (activity.predecessors || []).map(String),
      earliestStart: timing.earliestStart, earliestFinish: timing.earliestFinish,
      latestStart: late.latestStart, latestFinish: late.latestFinish,
      slackDays: slack, critical: slack === 0
    };
  });
  const criticalPath = rows.filter((row) => row.critical).map((row) => row.id);
  return {
    activities: rows, projectedProjectFinish: projectFinish, deadline,
    criticalPath, criticalPathActivityIds: criticalPath,
    finalDeadlineImpactDays: Math.max(0, dayDiff(deadline, projectFinish))
  };
}

async function calculateDelays(projectId, statusDate = new Date()) {
  const [project, activities, schedule] = await Promise.all([
    getProject(projectId),
    Activity.find({ projectId }).lean(),
    calculateSchedule(projectId)
  ]);
  const status = sameDay(statusDate);
  const map = new Map(activities.map((item) => [String(item._id), item]));
  const scheduleMap = new Map(schedule.activities.map((item) => [item.id, item]));
  const localDelays = new Map();
  const totalDelays = new Map();
  const active = new Set();
  function delayFor(id) {
    if (totalDelays.has(id)) return totalDelays.get(id);
    if (active.has(id)) throw new Error("Circular activity dependencies detected.");
    active.add(id);
    const activity = map.get(id);
    const timing = scheduleMap.get(id);
    const elapsed = Math.max(0, Math.min(activity.durationDays, dayDiff(activity.startDate, status) + 1));
    const expectedPercent = activity.durationDays > 0 ? elapsed / activity.durationDays * 100 : 100;
    const progressDelay = Math.max(0, Math.ceil((expectedPercent - activity.percentComplete) * activity.durationDays / 100));
    const overdue = timing.earliestFinish < status && activity.percentComplete < 100
      ? Math.max(0, dayDiff(timing.earliestFinish, status)) : 0;
    const local = Math.max(progressDelay, overdue);
    localDelays.set(id, local);
    const predecessorLag = (activity.predecessors || []).reduce((max, predecessor) =>
      Math.max(max, map.has(String(predecessor)) ? delayFor(String(predecessor)) : 0), 0);
    const propagated = predecessorLag + local;
    totalDelays.set(id, propagated);
    active.delete(id);
    return propagated;
  }
  activities.forEach((activity) => delayFor(String(activity._id)));
  const delayedActivities = activities.map((activity) => {
    const id = String(activity._id);
    return {
      id, name: activity.name, percentComplete: activity.percentComplete,
      expectedPercentComplete: Math.min(100, Math.max(0, Math.floor((Math.min(activity.durationDays, Math.max(0, dayDiff(activity.startDate, status) + 1)) / Math.max(1, activity.durationDays)) * 100))),
      localDelayDays: localDelays.get(id), propagatedDelayDays: totalDelays.get(id),
      delayDays: totalDelays.get(id), delayed: totalDelays.get(id) > 0,
      projectedStart: plusDays(scheduleMap.get(id).earliestStart,
        (activity.predecessors || []).reduce((max, predecessor) => Math.max(max, totalDelays.get(String(predecessor)) || 0), 0)),
      projectedFinish: plusDays(scheduleMap.get(id).earliestFinish, totalDelays.get(id))
    };
  });
  const finish = delayedActivities.reduce((latest, item) => item.projectedFinish > latest ? item.projectedFinish : latest, sameDay(project.startDate));
  const deadline = plusDays(project.deadline, 0);
  return {
    statusDate: status, activities: delayedActivities.filter((activity) => activity.delayed),
    allActivities: delayedActivities, projectedProjectFinish: finish, deadline,
    finalDeadlineImpactDays: Math.max(0, dayDiff(deadline, finish))
  };
}

module.exports = { calculateSchedule, calculateDelays, ensureAcyclic, circularGraph, plusDays, dayDiff };
