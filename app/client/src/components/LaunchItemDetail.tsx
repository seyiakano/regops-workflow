import { useEffect, useState } from "react";
import { api } from "../api";
import type { LaunchGate, LaunchItem } from "../types";
import { useAuth } from "../auth";

const STATUS_LABEL: Record<string, string> = {
  in_progress: "In progress",
  ready: "Ready to launch",
  blocked: "Blocked",
};

function GateRow({ gate, onAct }: { gate: LaunchGate; onAct: (action: "approved" | "blocked", comment: string) => void }) {
  const { user } = useAuth();
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canAct = !!user && user.approver_role === gate.approver_role;

  async function act(action: "approved" | "blocked") {
    setSubmitting(true);
    try {
      await onAct(action, comment);
      setComment("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <li className={`gate-row gate-row-${gate.status}`}>
      <div className="gate-row-header">
        <span className={`gate-dot gate-dot-${gate.status}`} />
        <div>
          <div className="gate-row-name">{gate.gate_name}</div>
          <div className="muted">{gate.approver_role}</div>
        </div>
        <span className={`badge badge-gate-${gate.status}`}>{gate.status}</span>
      </div>
      {gate.actor && (
        <p className="muted gate-decision-note">
          {gate.status === "approved" ? "Approved" : "Blocked"} by {gate.actor}
          {gate.decided_at ? ` on ${new Date(gate.decided_at).toLocaleString()}` : ""}
          {gate.comment ? ` — "${gate.comment}"` : ""}
        </p>
      )}
      {canAct && (
        <div className="gate-action-row form">
          <label>
            Comment
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional note" />
          </label>
          <div className="action-buttons">
            <button className="btn-primary" disabled={submitting} onClick={() => act("approved")}>
              Approve
            </button>
            <button className="btn-danger" disabled={submitting} onClick={() => act("blocked")}>
              Block
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export function LaunchItemDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [item, setItem] = useState<LaunchItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setItem(await api.getLaunchItem(id));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleGateAction(gateId: string, action: "approved" | "blocked", comment: string) {
    try {
      await api.actionLaunchGate(id, gateId, { action, comment: comment || undefined });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!item) return <div className="page">{error ? <p className="error">{error}</p> : <p>Loading…</p>}</div>;

  const overdue = item.days_until_launch < 0 && item.status !== "ready";

  return (
    <div className="page">
      <button className="btn-secondary" onClick={onBack}>
        ← Back
      </button>

      <section className="panel">
        <div className="panel-header">
          <h2>{item.product_name}</h2>
          <div className="panel-header-badges">
            <span className={`badge badge-${item.status}`}>{STATUS_LABEL[item.status]}</span>
          </div>
        </div>
        <p className="muted">
          Target launch: {new Date(item.target_launch_date).toLocaleDateString()} ·{" "}
          {overdue ? (
            <strong className="error">{Math.abs(item.days_until_launch)} days overdue</strong>
          ) : (
            `${item.days_until_launch} days remaining`
          )}{" "}
          · Owner {item.submitted_by}
        </p>
        {item.description && <p>{item.description}</p>}

        <h3>Readiness Gates ({item.gates_approved}/{item.gates_total} clear)</h3>
        <ul className="gate-list">
          {item.gates.map((gate) => (
            <GateRow key={gate.id} gate={gate} onAct={(action, comment) => handleGateAction(gate.id, action, comment)} />
          ))}
        </ul>

        {error && <p className="error">{error}</p>}
      </section>
    </div>
  );
}
