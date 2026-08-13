import { useEffect, useState } from "react";
import { api } from "../api";
import type { CaseStats, InstanceStatus, WorkflowInstance } from "../types";
import { StatusBadge } from "./StatusBadge";
import { SlaBadge } from "./SlaBadge";

const STATUS_TABS: { label: string; value: InstanceStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Pending", value: "in_progress" },
  { label: "Revision required", value: "revision_required" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Returned", value: "returned_to_submitter" },
];

const PERIOD_TABS: { label: string; value: string }[] = [
  { label: "Today", value: "today" },
  { label: "This week", value: "week" },
  { label: "This month", value: "month" },
  { label: "All time", value: "all" },
];

const PAGE_SIZE = 12;

export function ReviewerBoard({ onOpenInstance }: { onOpenInstance: (id: string) => void }) {
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<InstanceStatus | "">("in_progress");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [period, setPeriod] = useState("week");
  const [sortBySla, setSortBySla] = useState(false);
  const [stats, setStats] = useState<CaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [inst, s] = await Promise.all([
        api.listInstances({ status: statusFilter || undefined, q: search || undefined, limit: PAGE_SIZE, offset }),
        api.getStats(period),
      ]);
      setInstances(inst.items);
      setTotal(inst.total);
      setStats(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search, offset, period]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const displayedInstances = sortBySla
    ? [...instances].sort((a, b) => {
        const pctA = a.hours_in_stage != null ? a.hours_in_stage / a.sla_target_hours : -Infinity;
        const pctB = b.hours_in_stage != null ? b.hours_in_stage / b.sla_target_hours : -Infinity;
        return pctB - pctA;
      })
    : instances;

  return (
    <div className="page">
      <section className="panel">
        <div className="panel-header">
          <h2>Reviewer / Approver Board</h2>
          <input
            type="search"
            placeholder="Search case #, subject, submitter…"
            value={search}
            onChange={(e) => {
              setOffset(0);
              setSearch(e.target.value);
            }}
          />
        </div>
        <div className="status-tabs">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              className={`status-tab ${statusFilter === t.value ? "active" : ""}`}
              onClick={() => {
                setOffset(0);
                setStatusFilter(t.value);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="sla-sort-toggle">
          <input type="checkbox" checked={sortBySla} onChange={(e) => setSortBySla(e.target.checked)} />
          Sort by closest to SLA breach
        </label>

        {error && <p className="error">{error}</p>}
        {loading ? (
          <p>Loading…</p>
        ) : instances.length === 0 ? (
          <p className="muted">No cases match this filter.</p>
        ) : (
          <>
            <div className="case-grid">
              {displayedInstances.map((inst) => (
                <button key={inst.id} className="case-card" onClick={() => onOpenInstance(inst.id)}>
                  <div className="case-card-header">
                    <span className="case-number">{inst.case_number}</span>
                    <StatusBadge status={inst.status} />
                  </div>
                  {inst.sla_status && (
                    <div className="case-card-sla">
                      <SlaBadge status={inst.sla_status} hoursInStage={inst.hours_in_stage} />
                    </div>
                  )}
                  <div className="case-card-title">{inst.title}</div>
                  <dl className="case-card-fields">
                    <dt>Uploader</dt>
                    <dd>{inst.submitted_by}</dd>
                    <dt>Date</dt>
                    <dd>{new Date(inst.created_at).toLocaleDateString()}</dd>
                    <dt>Process</dt>
                    <dd>{inst.template_name}</dd>
                  </dl>
                  {inst.severity && <span className={`severity-badge severity-${inst.severity}`}>{inst.severity}</span>}
                </button>
              ))}
            </div>
            <div className="pagination">
              <span className="muted">
                {total} case{total === 1 ? "" : "s"} · page {page} of {pageCount}
              </span>
              <div className="pagination-buttons">
                <button
                  className="btn-secondary"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  ← Prev
                </button>
                <button
                  className="btn-secondary"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Summary of Requests</h2>
        </div>
        <div className="status-tabs">
          {PERIOD_TABS.map((t) => (
            <button
              key={t.value}
              className={`status-tab ${period === t.value ? "active" : ""}`}
              onClick={() => setPeriod(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {stats && (
          <div className="briefing-metrics">
            <div>
              <span className="briefing-metric-value">{stats.byStatus.pending}</span>
              <span className="muted">Pending</span>
            </div>
            <div>
              <span className="briefing-metric-value">{stats.byStatus.approved}</span>
              <span className="muted">Approved</span>
            </div>
            <div>
              <span className="briefing-metric-value">{stats.byStatus.rejected}</span>
              <span className="muted">Rejected</span>
            </div>
            <div>
              <span className="briefing-metric-value">{stats.byStatus.returned}</span>
              <span className="muted">Returned</span>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Types of Cases</h2>
        </div>
        {stats && stats.byType.length > 0 ? (
          <ul className="case-type-list">
            {stats.byType.map((t) => (
              <li key={t.name}>
                <span>{t.name}</span>
                <span className="chip">{t.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No cases in this period.</p>
        )}
      </section>
    </div>
  );
}
