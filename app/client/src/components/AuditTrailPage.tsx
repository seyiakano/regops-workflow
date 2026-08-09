import { useEffect, useState } from "react";
import { api } from "../api";
import type { AuditRow, AuditSummary, WorkflowTemplate } from "../types";

const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "submit", label: "Submit" },
  { value: "approve", label: "Approve" },
  { value: "reject", label: "Reject" },
  { value: "return", label: "Return" },
  { value: "ai_review", label: "AI review" },
];

export function AuditTrailPage() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filters = { from: from || undefined, to: to || undefined, template_id: templateId || undefined, action: action || undefined, q: q || undefined };

  async function refresh() {
    setLoading(true);
    try {
      const result = await api.getAudit(filters);
      setRows(result.rows);
      setSummary(result.summary);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api.listTemplates().then(setTemplates).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, templateId, action, q]);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await api.downloadAuditExport(filters);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="page">
      <section className="panel">
        <div className="panel-header">
          <h2>Audit Trail</h2>
          <button className="btn-primary" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting…" : "Export to Excel"}
          </button>
        </div>
        <p className="muted">
          Every submit, approve, reject, return, and AI-review action across all cases — filter it here, or export
          the same filtered view as a two-sheet workbook (Cases summary + full Audit Trail detail).
        </p>

        <div className="form form-row audit-filters">
          <label>
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label>
            Process type
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">All process types</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Action
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Search
            <input
              type="search"
              placeholder="Case #, actor, comment…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
        </div>

        {summary && (
          <div className="briefing-metrics">
            <div>
              <span className="briefing-metric-value">{summary.total}</span>
              <span className="muted">Total events</span>
            </div>
            <div>
              <span className="briefing-metric-value">{summary.submit}</span>
              <span className="muted">Submitted</span>
            </div>
            <div>
              <span className="briefing-metric-value">{summary.approve}</span>
              <span className="muted">Approved</span>
            </div>
            <div>
              <span className="briefing-metric-value">{summary.reject}</span>
              <span className="muted">Rejected</span>
            </div>
            <div>
              <span className="briefing-metric-value">{summary.return}</span>
              <span className="muted">Returned</span>
            </div>
            <div>
              <span className="briefing-metric-value">{summary.ai_review}</span>
              <span className="muted">AI reviews</span>
            </div>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        {loading ? (
          <p>Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted">No audit events match this filter.</p>
        ) : (
          <table className="instance-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Case #</th>
                <th>Case title</th>
                <th>Process type</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Stage</th>
                <th>Comment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="timestamp">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="case-number-cell">{r.case_number}</td>
                  <td>{r.case_title}</td>
                  <td>{r.template_name}</td>
                  <td>{r.actor}</td>
                  <td>
                    <span className={`badge badge-action-${r.action}`}>{r.action}</span>
                  </td>
                  <td>{r.stage_name ?? "—"}</td>
                  <td>{r.comment || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
