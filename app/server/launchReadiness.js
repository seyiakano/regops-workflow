import { nanoid } from "nanoid";
import { db } from "./db.js";

// Fixed standard gate set for every launch item — deliberately drawn from
// the same 5-role vocabulary already seeded elsewhere (seed.js/seedUsers.js)
// rather than introducing a new role, so no new users are needed to demo
// this. A real system would let a template define its own gate set; kept
// fixed here since this app only models one governance process.
export const LAUNCH_GATES = [
  { name: "Legal Review", approverRole: "Legal" },
  { name: "Compliance Sign-off", approverRole: "Compliance" },
  { name: "Senior Management Readiness Review", approverRole: "Senior Manager" },
  { name: "Executive Go-Live Approval", approverRole: "Executive" },
];

const now = () => new Date().toISOString();

export function createLaunchItem({ productName, description, targetLaunchDate, submittedBy }) {
  const id = nanoid();
  const ts = now();
  db.prepare(
    `INSERT INTO launch_items (id, product_name, description, target_launch_date, submitted_by, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?)`
  ).run(id, productName, description ?? null, targetLaunchDate, submittedBy, ts, ts);

  const insertGate = db.prepare(
    `INSERT INTO launch_gates (id, launch_item_id, gate_name, approver_role, status)
     VALUES (?, ?, ?, ?, 'pending')`
  );
  for (const gate of LAUNCH_GATES) {
    insertGate.run(nanoid(), id, gate.name, gate.approverRole);
  }

  return id;
}

// Overall status is always DERIVED from the current gate states, not
// independently tracked — readiness can legitimately regress (e.g. Legal
// re-flags something), so there's no locked "terminal" state the way an
// approval-chain instance has.
function recomputeStatus(launchItemId) {
  const gates = db.prepare("SELECT status FROM launch_gates WHERE launch_item_id = ?").all(launchItemId);
  let status = "in_progress";
  if (gates.some((g) => g.status === "blocked")) status = "blocked";
  else if (gates.length > 0 && gates.every((g) => g.status === "approved")) status = "ready";
  db.prepare("UPDATE launch_items SET status = ?, updated_at = ? WHERE id = ?").run(status, now(), launchItemId);
  return status;
}

export function actionGate({ launchItemId, gateId, action, actor, comment }) {
  const gate = db.prepare("SELECT * FROM launch_gates WHERE id = ? AND launch_item_id = ?").get(gateId, launchItemId);
  if (!gate) return null;
  db.prepare(
    `UPDATE launch_gates SET status = ?, actor = ?, comment = ?, decided_at = ? WHERE id = ?`
  ).run(action, actor, comment ?? "", now(), gateId);
  return recomputeStatus(launchItemId);
}

export function serializeLaunchItem(row) {
  const gates = db
    .prepare("SELECT * FROM launch_gates WHERE launch_item_id = ? ORDER BY rowid ASC")
    .all(row.id);
  const daysUntilLaunch = Math.ceil(
    (new Date(row.target_launch_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  return {
    ...row,
    gates,
    gates_total: gates.length,
    gates_approved: gates.filter((g) => g.status === "approved").length,
    days_until_launch: daysUntilLaunch,
  };
}
