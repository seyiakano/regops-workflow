import { useEffect, useState } from "react";
import { api } from "../api";
import type { Stage, WorkflowTemplate } from "../types";

const emptyStage = (): Stage => ({ name: "", approverRole: "" });

export function TemplatesPage() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stages, setStages] = useState<Stage[]>([emptyStage()]);
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setTemplates(await api.listTemplates());
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

  function updateStage(index: number, patch: Partial<Stage>) {
    setStages((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createTemplate({ name, description, stages });
      setName("");
      setDescription("");
      setStages([emptyStage()]);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this workflow template?")) return;
    try {
      await api.deleteTemplate(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="page">
      <section className="panel">
        <h2>New Workflow Template</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>

          <div className="stages-editor">
            <div className="stages-editor-header">
              <span>Approval Stages (in order)</span>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStages((prev) => [...prev, emptyStage()])}
              >
                + Add stage
              </button>
            </div>
            {stages.map((stage, i) => (
              <div className="stage-row" key={i}>
                <span className="stage-index">{i + 1}</span>
                <input
                  placeholder="Stage name (e.g. 1LoD Review)"
                  value={stage.name}
                  onChange={(e) => updateStage(i, { name: e.target.value })}
                  required
                />
                <input
                  placeholder="Approver role (e.g. Compliance)"
                  value={stage.approverRole}
                  onChange={(e) => updateStage(i, { approverRole: e.target.value })}
                  required
                />
                {stages.length > 1 && (
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => setStages((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="Remove stage"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Creating…" : "Create Template"}
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Existing Templates</h2>
        {loading ? (
          <p>Loading…</p>
        ) : templates.length === 0 ? (
          <p className="muted">No templates yet — create one above.</p>
        ) : (
          <ul className="template-list">
            {templates.map((t) => (
              <li key={t.id} className="template-card">
                <div>
                  <h3>{t.name}</h3>
                  {t.description && <p className="muted">{t.description}</p>}
                  <ol className="stage-chain">
                    {t.stages.map((s, i) => (
                      <li key={i}>
                        <span className="chip">{s.name}</span>
                        <span className="muted"> — {s.approverRole}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <button className="btn-icon" onClick={() => handleDelete(t.id)} aria-label="Delete template">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
