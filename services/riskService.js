"use strict";

const { Risk, PdpcNode, Defect } = require("../models");

function band(score) {
  if (score >= 20) return "Critical";
  if (score >= 12) return "High";
  if (score >= 6) return "Medium";
  return "Low";
}

async function rankedRisks(projectId) {
  const risks = await Risk.find({ projectId }).sort({ score: -1, title: 1 }).lean();
  return risks.map((risk, index) => ({ ...risk, id: String(risk._id), rank: index + 1, priorityBand: band(risk.score) }));
}

async function riskMatrix(projectId) {
  const risks = await Risk.find({ projectId }).lean();
  const grid = Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, column) => {
    const likelihood = 5 - row;
    const impact = column + 1;
    const matching = risks.filter((risk) => risk.likelihood === likelihood && risk.impact === impact);
    return { likelihood, impact, score: likelihood * impact, count: matching.length, risks: matching.map((risk) => ({ id: String(risk._id), title: risk.title, score: risk.score })) };
  }));
  return { grid };
}

async function pdpcTree(projectId) {
  const nodes = await PdpcNode.find({ projectId }).sort({ createdAt: 1 }).lean();
  const byId = new Map(nodes.map((node) => [String(node._id), { ...node, id: String(node._id), children: [] }]));
  const roots = [];
  byId.forEach((node) => {
    const parent = node.parentId && byId.get(String(node.parentId));
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  return roots;
}

async function defectSummary(projectId) {
  const defects = await Defect.find({ projectId }).lean();
  const bySeverity = {};
  const byStatus = {};
  ["Critical", "High", "Medium", "Low"].forEach((key) => { bySeverity[key] = 0; });
  ["Open", "In Progress", "Resolved", "Closed"].forEach((key) => { byStatus[key] = 0; });
  defects.forEach((defect) => {
    bySeverity[defect.severity] += 1;
    byStatus[defect.status] += 1;
  });
  return {
    total: defects.length, bySeverity, byStatus,
    unresolvedCritical: defects.filter((defect) => defect.severity === "Critical" && !["Resolved", "Closed"].includes(defect.status)).length
  };
}

module.exports = { rankedRisks, riskMatrix, pdpcTree, defectSummary, band };
