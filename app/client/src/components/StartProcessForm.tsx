import { useRef, useState } from "react";
import { api } from "../api";
import type { Severity, WorkflowInstance, WorkflowTemplate } from "../types";
import { getContentLabel, getContentPlaceholder, SEVERITY_OPTIONS } from "../constants";
import { useAuth } from "../auth";

export function StartProcessForm({
  templates,
  onCreated,
}: {
  templates: WorkflowTemplate[];
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [figmaLink, setFigmaLink] = useState("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<WorkflowInstance | null>(null);

  const selectedTemplate = templates.find((t) => t.id === templateId);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    setFiles((prev) => [...prev, ...Array.from(fileList)]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTemplate || !user) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createInstance({
        template_id: templateId,
        title,
        content,
        figma_link: figmaLink || undefined,
        severity: severity || undefined,
      });
      if (files.length > 0) {
        await api.uploadAttachments(created.id, files);
      }
      setLastCreated(created);
      setTemplateId("");
      setTitle("");
      setContent("");
      setFigmaLink("");
      setSeverity("");
      setFiles([]);
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (templates.length === 0) {
    return (
      <section className="panel">
        <h2>Start New Process</h2>
        <p className="muted">No process types configured yet — create a workflow template first.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Start New Process</h2>

      {lastCreated && (
        <div className="case-created-banner">
          Case <strong>{lastCreated.case_number}</strong> created — routed to{" "}
          <strong>{lastCreated.current_stage?.name}</strong> ({lastCreated.current_stage?.approverRole}).
        </div>
      )}

      <form onSubmit={handleSubmit} className="form">
        <div className="form-row">
          <label>
            Name
            <input value={user?.name ?? ""} disabled />
          </label>
        </div>

        <div>
          <span className="step-label">1. Select process type</span>
          <div className="process-type-grid">
            {templates.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`process-type-card ${templateId === t.id ? "selected" : ""}`}
                onClick={() => setTemplateId(t.id)}
              >
                <div className="process-type-name">{t.name}</div>
                {t.description && <div className="muted">{t.description}</div>}
              </button>
            ))}
          </div>
        </div>

        {selectedTemplate && (
          <>
            <div className="routing-preview">
              <span className="step-label">This process will route to:</span>
              <ol className="routing-chain">
                {selectedTemplate.stages.map((s, i) => (
                  <li key={i}>
                    {s.name} <span className="muted">({s.approverRole})</span>
                  </li>
                ))}
              </ol>
            </div>

            <span className="step-label">2. Case details</span>
            <label>
              Case subject
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label>
              {getContentLabel(selectedTemplate.name)}
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                placeholder={getContentPlaceholder(selectedTemplate.name)}
                required
              />
            </label>
            <label>
              Figma link (where necessary)
              <input
                type="url"
                value={figmaLink}
                onChange={(e) => setFigmaLink(e.target.value)}
                placeholder="https://figma.com/..."
              />
            </label>
            <label>
              Screenshots
              <div className="file-upload-row">
                <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
                  Upload
                </button>
                <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
                  + Add
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="file-input-hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </div>
              {files.length > 0 && (
                <ul className="file-list">
                  {files.map((f, i) => (
                    <li key={i}>
                      <span>{f.name}</span>
                      <button type="button" className="btn-icon" onClick={() => removeFile(i)}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </label>
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

            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Starting…" : "Start Process"}
            </button>
          </>
        )}
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
