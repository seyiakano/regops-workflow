import { useEffect, useState } from "react";
import { api } from "../api";
import type { LaunchItem } from "../types";

const STATUS_LABEL: Record<string, string> = {
  in_progress: "In progress",
  ready: "Ready to launch",
  blocked: "Blocked",
};

function daysLabel(days: number, status: string) {
  if (status === "ready") return { text: "Ready", cls: "days-ok" };
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, cls: "days-overdue" };
  if (days <= 7) return { text: `${days}d left`, cls: "days-urgent" };
  return { text: `${days}d left`, cls: "days-ok" };
}

export function LaunchReadinessBoard({ onOpenItem }: { onOpenItem: (id: string) => void }) {
  const [items, setItems] = useState<LaunchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setItems(await api.listLaunchItems());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createLaunchItem({
        product_name: productName,
        description: description || undefined,
        target_launch_date: targetDate,
      });
      setProductName("");
      setDescription("");
      setTargetDate("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <section className="panel">
        <h2>Start New Launch</h2>
        <p className="muted">
          Register a product launch against a target go-live date. Legal, Compliance, Senior Management, and
          Executive each sign off independently — the launch is ready once all four gates are clear.
        </p>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Product / feature name
            <input value={productName} onChange={(e) => setProductName(e.target.value)} required />
          </label>
          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What's launching, and why — enough for a reviewer to assess readiness."
            />
          </label>
          <label>
            Target launch date
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} required />
          </label>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Creating…" : "Register Launch"}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Launch Readiness</h2>
        </div>
        {loading ? (
          <p>Loading…</p>
        ) : items.length === 0 ? (
          <p className="muted">No launches registered yet.</p>
        ) : (
          <div className="case-grid">
            {items.map((item) => {
              const days = daysLabel(item.days_until_launch, item.status);
              return (
                <button key={item.id} className="case-card" onClick={() => onOpenItem(item.id)}>
                  <div className="case-card-header">
                    <span className={`badge badge-${item.status}`}>{STATUS_LABEL[item.status]}</span>
                    <span className={`days-badge ${days.cls}`}>{days.text}</span>
                  </div>
                  <div className="case-card-title">{item.product_name}</div>
                  <dl className="case-card-fields">
                    <dt>Target date</dt>
                    <dd>{new Date(item.target_launch_date).toLocaleDateString()}</dd>
                    <dt>Owner</dt>
                    <dd>{item.submitted_by}</dd>
                  </dl>
                  <div className="gate-mini-list">
                    {item.gates.map((g) => (
                      <span key={g.id} className={`gate-dot gate-dot-${g.status}`} title={`${g.gate_name}: ${g.status}`} />
                    ))}
                    <span className="muted gate-mini-count">
                      {item.gates_approved}/{item.gates_total} gates clear
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
