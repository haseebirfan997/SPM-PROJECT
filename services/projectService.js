"use strict";

const { Project } = require("../models");

async function getProject(projectId, session) {
  const query = projectId ? Project.findById(projectId) : Project.findOne().sort({ createdAt: 1 });
  if (session) query.session(session);
  const project = await query;
  if (!project) {
    const error = new Error("No project exists. Create a project before managing project records.");
    error.status = 404;
    throw error;
  }
  return project;
}

module.exports = { getProject };
