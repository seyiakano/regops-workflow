import ExcelJS from "exceljs";
import { db } from "./db.js";

function caseNumber(rowid) {
  return `CASE-${String(rowid).padStart(6, "0")}`;
}

// Shared filter-to-SQL builder for both the on-screen audit table and the
// Excel export, so the two can never silently drift apart.
function buildAuditQuery({ from, to, template_id, action, q }) {
  const clauses = [];
  const params = [];

  if (from) {
    clauses.push("audit_log.created_at >= ?");
    params.push(from);
  }
  if (to) {
    clauses.push("audit_log.created_at <= ?");
    params.push(to);
  }
  if (template_id) {
    clauses.push("instances.template_id = ?");
    params.push(template_id);
  }
  if (action) {
    clauses.push("audit_log.action = ?");
    params.push(action);
  }
  if (q) {
    clauses.push("(instances.title LIKE ? OR audit_log.actor LIKE ? OR audit_log.comment LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { where, params };
}

export function queryAuditLog(filters) {
  const { where, params } = buildAuditQuery(filters);
  const rows = db
    .prepare(
      `SELECT audit_log.id, audit_log.stage_name, audit_log.actor, audit_log.action, audit_log.comment,
              audit_log.created_at,
              instances.rowid as instance_rowid, instances.title as case_title,
              workflow_templates.name as template_name
       FROM audit_log
       JOIN instances ON instances.id = audit_log.instance_id
       JOIN workflow_templates ON workflow_templates.id = instances.template_id
       ${where}
       ORDER BY audit_log.created_at DESC`
    )
    .all(...params);

  return rows.map((r) => ({
    ...r,
    case_number: caseNumber(r.instance_rowid),
  }));
}

export function getAuditSummary(rows) {
  const summary = { total: rows.length, submit: 0, approve: 0, reject: 0, return: 0, ai_review: 0 };
  for (const r of rows) {
    if (r.action in summary) summary[r.action]++;
  }
  return summary;
}

function getCasesForExport({ from, to, template_id }) {
  const clauses = [];
  const params = [];
  if (from) {
    clauses.push("instances.created_at >= ?");
    params.push(from);
  }
  if (to) {
    clauses.push("instances.created_at <= ?");
    params.push(to);
  }
  if (template_id) {
    clauses.push("instances.template_id = ?");
    params.push(template_id);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `SELECT instances.rowid, instances.title, instances.submitted_by, instances.status, instances.severity,
              instances.current_stage_index, instances.created_at, instances.updated_at,
              workflow_templates.name as template_name, workflow_templates.stages
       FROM instances
       JOIN workflow_templates ON workflow_templates.id = instances.template_id
       ${where}
       ORDER BY instances.created_at DESC`
    )
    .all(...params);

  return rows.map((r) => {
    const stages = JSON.parse(r.stages);
    return {
      case_number: caseNumber(r.rowid),
      title: r.title,
      template_name: r.template_name,
      status: r.status,
      current_stage: stages[r.current_stage_index]?.name ?? "—",
      submitted_by: r.submitted_by,
      severity: r.severity ?? "",
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });
}

const STATUS_LABEL = {
  in_progress: "In progress",
  approved: "Approved",
  rejected: "Rejected",
  returned_to_submitter: "Returned",
};

export async function buildAuditWorkbook(filters) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RegOps Flow";
  workbook.created = new Date();

  const casesSheet = workbook.addWorksheet("Cases");
  casesSheet.columns = [
    { header: "Case #", key: "case_number", width: 14 },
    { header: "Subject", key: "title", width: 32 },
    { header: "Process Type", key: "template_name", width: 28 },
    { header: "Status", key: "status", width: 16 },
    { header: "Current Stage", key: "current_stage", width: 24 },
    { header: "Submitted By", key: "submitted_by", width: 20 },
    { header: "Severity", key: "severity", width: 10 },
    { header: "Created", key: "created_at", width: 20 },
    { header: "Updated", key: "updated_at", width: 20 },
  ];
  casesSheet.getRow(1).font = { bold: true };
  casesSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE1E0D9" } };
  for (const c of getCasesForExport(filters)) {
    casesSheet.addRow({ ...c, status: STATUS_LABEL[c.status] ?? c.status });
  }

  const auditSheet = workbook.addWorksheet("Audit Trail");
  auditSheet.columns = [
    { header: "Case #", key: "case_number", width: 14 },
    { header: "Case Subject", key: "case_title", width: 32 },
    { header: "Process Type", key: "template_name", width: 28 },
    { header: "Timestamp", key: "created_at", width: 20 },
    { header: "Actor", key: "actor", width: 20 },
    { header: "Action", key: "action", width: 14 },
    { header: "Stage", key: "stage_name", width: 24 },
    { header: "Comment", key: "comment", width: 40 },
  ];
  auditSheet.getRow(1).font = { bold: true };
  auditSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE1E0D9" } };
  for (const r of queryAuditLog(filters)) {
    auditSheet.addRow(r);
  }

  return workbook;
}
