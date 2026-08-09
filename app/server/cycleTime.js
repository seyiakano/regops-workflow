import { db } from "./db.js";

// Only these actions represent a stage transition (entering/exiting a
// stage) — ai_review rows are informational and never move the case, so
// they're excluded from dwell-time math entirely.
const TRANSITION_ACTIONS = new Set(["submit", "approve", "reject", "return"]);

function hoursBetween(aIso, bIso) {
  return (new Date(bIso).getTime() - new Date(aIso).getTime()) / (1000 * 60 * 60);
}

function average(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Cycle-time / bottleneck analytics — computed from the same audit_log the
// Audit Trail BI page reads, so this can never drift from what's on the
// record. Two distinct measures: (1) COMPLETED stage dwell times, grouped by
// approver role, answering "which role is typically the slowest to act", and
// (2) live SLA breaches — cases sitting in their current stage right now
// longer than the given threshold.
export function getCycleTimeMetrics(slaHours = 48) {
  const instances = db.prepare("SELECT rowid, * FROM instances").all();
  const templates = db.prepare("SELECT id, stages FROM workflow_templates").all();
  const stagesById = Object.fromEntries(templates.map((t) => [t.id, JSON.parse(t.stages)]));

  const auditRows = db
    .prepare(
      `SELECT instance_id, stage_name, action, created_at FROM audit_log
       WHERE action IN ('submit','approve','reject','return')
       ORDER BY instance_id, created_at ASC`
    )
    .all();
  const rowsByInstance = new Map();
  for (const row of auditRows) {
    if (!rowsByInstance.has(row.instance_id)) rowsByInstance.set(row.instance_id, []);
    rowsByInstance.get(row.instance_id).push(row);
  }

  // Stage name -> approverRole. Stage names are a shared vocabulary across
  // templates (see seed.js/seedUsers.js sync comments), so search every
  // template's stage list rather than assuming a single owning template.
  function roleForStageName(stageName) {
    for (const stages of Object.values(stagesById)) {
      const match = stages.find((s) => s.name === stageName);
      if (match) return match.approverRole;
    }
    return null;
  }

  const dwellByRole = {};
  for (const rows of rowsByInstance.values()) {
    for (let i = 1; i < rows.length; i++) {
      const role = roleForStageName(rows[i].stage_name);
      if (!role) continue;
      const hrs = hoursBetween(rows[i - 1].created_at, rows[i].created_at);
      if (hrs >= 0) (dwellByRole[role] ??= []).push(hrs);
    }
  }

  const byRole = Object.entries(dwellByRole)
    .map(([role, hours]) => ({
      role,
      count: hours.length,
      avgHours: round1(average(hours)),
      medianHours: round1(median(hours)),
      maxHours: round1(Math.max(...hours)),
    }))
    .sort((a, b) => b.avgHours - a.avgHours);

  const resolved = instances.filter((i) => i.status !== "in_progress");
  const resolutionHours = resolved
    .map((i) => hoursBetween(i.created_at, i.updated_at))
    .filter((h) => h >= 0);

  const nowIso = new Date().toISOString();
  const breaches = [];
  for (const inst of instances) {
    if (inst.status !== "in_progress") continue;
    const stages = stagesById[inst.template_id] ?? [];
    const stage = stages[inst.current_stage_index];
    if (!stage) continue;
    const rows = rowsByInstance.get(inst.id) ?? [];
    const enteredAt = rows.length ? rows[rows.length - 1].created_at : inst.created_at;
    const hrs = hoursBetween(enteredAt, nowIso);
    if (hrs >= slaHours) {
      breaches.push({
        case_number: `CASE-${String(inst.rowid).padStart(6, "0")}`,
        title: inst.title,
        stage_name: stage.name,
        approver_role: stage.approverRole,
        hours_in_stage: round1(hrs),
        submitted_by: inst.submitted_by,
      });
    }
  }
  breaches.sort((a, b) => b.hours_in_stage - a.hours_in_stage);

  return {
    slaHours,
    byRole,
    overall: {
      resolvedCount: resolutionHours.length,
      avgResolutionHours: round1(average(resolutionHours)),
      medianResolutionHours: round1(median(resolutionHours)),
    },
    breaches,
  };
}
