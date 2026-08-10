import { useEffect, useState } from "react";
import { api } from "../api";
import type { DeployTarget, IntegrationEvent, Severity, WorkflowTemplate } from "../types";
import { SEVERITY_OPTIONS, getContentLabel, getContentPlaceholder } from "../constants";

const EVENT_TYPE_LABELS: Record<string, string> = {
  slack_notification: "Slack notification",
  slack_inbound: "Slack inbound",
  deploy_trigger: "Deploy trigger",
};

export function IntegrationsPage() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [events, setEvents] = useState<IntegrationEvent[]>([]);
  const [deployTargets, setDeployTargets] = useState<Record<string, DeployTarget>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const selectedTemplate = templates.find((t) => t.id === templateId);

  async function refresh() {
    try {
      const ev = await api.listIntegrationEvents(50);
      setEvents(ev);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api.listTemplates().then(setTemplates).catch(() => {});
    api.getDeployTargets().then(setDeployTargets).catch(() => {});
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSlackSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTemplate) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.simulateSlackNewCase({
        template_id: templateId,
        title,
        content,
        severity: severity || undefined,
      });
      setLastResult(`Case ${created.case_number} created from the simulated Slack submission.`);
      setTemplateId("");
      setTitle("");
      setContent("");
      setSeverity("");
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
        <h2>Integrations</h2>
        <p className="muted">
          No live Slack app or CI/CD credentials are connected here — this panel simulates the exact contract those
          integrations would use, so the design is demonstrable without wiring up real external systems. Every
          simulated call below is logged with the payload it would actually send.
        </p>
      </section>

      <section className="panel slack-intake-panel">
        <div className="slack-intake-header">
          <span className="slack-intake-icon">#</span>
          <div>
            <div className="slack-intake-title">regops-intake</div>
            <div className="muted">Simulated Slack slash command · /regops new-case</div>
          </div>
        </div>

        {lastResult && <div className="case-created-banner">{lastResult}</div>}

        <form onSubmit={handleSlackSubmit} className="form">
          <label>
            Process type
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
              <option value="" disabled>
                Select process type…
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Case subject
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="What you'd type after /regops new-case"
            />
          </label>
          {selectedTemplate && (
            <label>
              {getContentLabel(selectedTemplate.name)}
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={3}
                placeholder={getContentPlaceholder(selectedTemplate.name)}
                required
              />
            </label>
          )}
          <label>
            Urgency
            <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} required>
              <option value="" disabled>
                Select urgency…
              </option>
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn-primary" disabled={submitting || !selectedTemplate}>
            {submitting ? "Sending…" : "Send via Slack (simulated)"}
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>What a final approval triggers</h2>
        <p className="muted">
          "Push to production" means something different per process — publishing marketing copy isn't the same
          operation as listing an asset or shipping a code change. Each process type maps to a distinct downstream
          system, and the trigger fires automatically the moment a case reaches final approval.
        </p>
        <table className="instance-table">
          <thead>
            <tr>
              <th>Process type</th>
              <th>Target system</th>
              <th>Simulated action</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(deployTargets).map(([templateName, target]) => (
              <tr key={templateName}>
                <td>{templateName}</td>
                <td>{target.system}</td>
                <td>
                  <code>{target.action}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Integration Activity</h2>
          <button className="btn-secondary" onClick={refresh} type="button">
            Refresh
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {loading ? (
          <p>Loading…</p>
        ) : events.length === 0 ? (
          <p className="muted">No integration events yet — submit a case or take a final decision to see one logged here.</p>
        ) : (
          <ul className="integration-feed">
            {events.map((ev) => (
              <li key={ev.id} className="integration-event">
                <div className="integration-event-header">
                  <span className={`badge badge-direction-${ev.direction}`}>{ev.direction}</span>
                  <span className={`badge badge-event-${ev.event_type}`}>
                    {EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type}
                  </span>
                  <span className="integration-event-target">{ev.target}</span>
                  {ev.case_number && <span className="muted">{ev.case_number}</span>}
                  <span className="muted timestamp">{new Date(ev.created_at).toLocaleString()}</span>
                </div>
                <p>{ev.summary}</p>
                <details>
                  <summary>View simulated payload</summary>
                  <pre className="integration-payload">{JSON.stringify(ev.payload, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
