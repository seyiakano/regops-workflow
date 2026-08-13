import { useEffect, useState } from "react";
import { api } from "../api";
import type { WorkflowInstance, WorkflowTemplate } from "../types";
import { StatusBadge } from "./StatusBadge";
import { SlaBadge } from "./SlaBadge";
import { StartProcessForm } from "./StartProcessForm";

const PAGE_SIZE = 10;

export function Dashboard({ onOpenInstance }: { onOpenInstance: (id: string) => void }) {
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [total, setTotal] = useState(0);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [inst, tmpl] = await Promise.all([
        api.listInstances({ status: statusFilter || undefined, q: search || undefined, limit: PAGE_SIZE, offset }),
        api.listTemplates(),
      ]);
      setInstances(inst.items);
      setTotal(inst.total);
      setTemplates(tmpl);
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
  }, [statusFilter, search, offset]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page">
      <StartProcessForm templates={templates} onCreated={refresh} />

      <section className="panel">
        <div className="panel-header">
          <h2>Cases</h2>
          <div className="table-controls">
            <input
              type="search"
              placeholder="Search case #, subject, submitter…"
              value={search}
              onChange={(e) => {
                setOffset(0);
                setSearch(e.target.value);
              }}
            />
            <select
              value={statusFilter}
              onChange={(e) => {
                setOffset(0);
                setStatusFilter(e.target.value);
              }}
            >
              <option value="">All statuses</option>
              <option value="in_progress">In progress</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="returned_to_submitter">Returned to submitter</option>
              <option value="revision_required">Revision required</option>
            </select>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        {loading ? (
          <p>Loading…</p>
        ) : instances.length === 0 ? (
          <p className="muted">No cases match this filter.</p>
        ) : (
          <>
            <div className="table-scroll">
              <table className="instance-table">
                <thead>
                  <tr>
                    <th>Case #</th>
                    <th>Subject</th>
                    <th>Process Type</th>
                    <th>Current stage</th>
                    <th>Status</th>
                    <th>SLA</th>
                    <th>Submitted by</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {instances.map((inst) => (
                    <tr key={inst.id} className="clickable-row" onClick={() => onOpenInstance(inst.id)}>
                      <td className="case-number-cell">{inst.case_number}</td>
                      <td>{inst.title}</td>
                      <td>{inst.template_name}</td>
                      <td>{inst.current_stage?.name ?? "—"}</td>
                      <td>
                        <StatusBadge status={inst.status} />
                      </td>
                      <td>
                        <SlaBadge status={inst.sla_status} hoursInStage={inst.hours_in_stage} />
                      </td>
                      <td>{inst.submitted_by}</td>
                      <td>{new Date(inst.updated_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
    </div>
  );
}
