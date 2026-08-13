// Exportable regulatory audit trail (Feature 3) — a structured CSV of the
// complete, immutable event history, separate from the existing Excel
// export: this one derives Previous/New Stage by pairing each case's audit
// rows chronologically, and looks up the actor's email/role from the users
// table (audit_log only stores the actor's name at the time of the event).
import { db } from "./db.js";
import { queryAuditLog } from "./auditReport.js";

const TERMINAL_LABEL = {
  approve: "Approved",
  reject: "Rejected",
  return: "Returned to submitter",
  request_revision: "Revision Required",
  resubmit: "Resubmitted",
};

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildAuditCsv(filters) {
  const rows = queryAuditLog(filters);

  const byInstance = new Map();
  for (const r of rows) {
    if (!byInstance.has(r.instance_id)) byInstance.set(r.instance_id, []);
    byInstance.get(r.instance_id).push(r);
  }
  for (const list of byInstance.values()) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  const users = db.prepare("SELECT name, email, approver_role FROM users").all();
  const userByName = Object.fromEntries(users.map((u) => [u.name, u]));

  const header = [
    "Case ID",
    "Title",
    "User Email",
    "User Role",
    "Action Taken",
    "Previous Stage",
    "New Stage",
    "Timestamp (ISO)",
    "Comments/Notes",
  ];
  const lines = [header.map(csvEscape).join(",")];

  for (const list of byInstance.values()) {
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const next = list[i + 1];
      const u = userByName[r.actor];
      const newStage = next ? (next.stage_name ?? "") : (TERMINAL_LABEL[r.action] ?? "");
      lines.push(
        [
          `CASE-${String(r.instance_rowid).padStart(6, "0")}`,
          r.case_title,
          u?.email ?? "",
          u?.approver_role ?? "",
          r.action,
          r.stage_name ?? "",
          newStage,
          r.created_at,
          r.comment ?? "",
        ]
          .map(csvEscape)
          .join(",")
      );
    }
  }

  return lines.join("\n");
}
