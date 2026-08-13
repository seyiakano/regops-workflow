import { useRef, useState } from "react";
import { api } from "../api";
import type { Severity, WorkflowInstance, WorkflowTemplate } from "../types";
import { getContentLabel, getContentPlaceholder, SEVERITY_OPTIONS } from "../constants";
import { useAuth } from "../auth";
import { computePreviewStages } from "../dynamicRouting";
import { runFcaPrecheck, type FcaPrecheckResult } from "../fcaPrecheck";

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
  const [precheck, setPrecheck] = useState<FcaPrecheckResult | null>(null);
  const [checklist, setChecklist] = useState({ disclosures: false, targetMarket: false, jurisdiction: false });
  const checklistComplete = checklist.disclosures && checklist.targetMarket && checklist.jurisdiction;

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const isFinancialPromotion = selectedTemplate?.name === "Financial Promotion Review";
  const routingStages = selectedTemplate ? computePreviewStages(selectedTemplate, { severity, content }) : [];

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
      setPrecheck(null);
      setChecklist({ disclosures: false, targetMarket: false, jurisdiction: false });
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
                onClick={() => {
                  setTemplateId(t.id);
                  setPrecheck(null);
                }}
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
                {routingStages.map((s, i) => (
                  <li key={i} className={s.approverRole === "Legal" ? "routing-stage-dynamic" : ""}>
                    {s.name} <span className="muted">({s.approverRole})</span>
                    {s.approverRole === "Legal" && !selectedTemplate.stages.some((base) => base.approverRole === "Legal") && (
                      <span className="chip chip-risk">risk-based</span>
                    )}
                  </li>
                ))}
              </ol>
              {routingStages.length > selectedTemplate.stages.length && (
                <p className="muted routing-dynamic-note">
                  A 2LoD Legal &amp; Sanctions Review has been added automatically because this case is high/severe
                  urgency{selectedTemplate.name === "Asset Listing Governance Review" ? " or involves a complex product (staking/yield)" : ""}.
                </p>
              )}
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
                onChange={(e) => {
                  setContent(e.target.value);
                  setPrecheck(null);
                }}
                rows={4}
                placeholder={getContentPlaceholder(selectedTemplate.name)}
                required
              />
            </label>

            {isFinancialPromotion && (
              <div className="fca-precheck">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPrecheck(runFcaPrecheck(content))}
                  disabled={!content.trim()}
                >
                  Run Compliance First-Pass Check
                </button>
                {precheck && (
                  <div className={`fca-precheck-card ${precheck.pass ? "fca-precheck-pass" : "fca-precheck-fail"}`}>
                    <div className="fca-precheck-header">
                      <strong>FCA Compliance Pre-Check</strong>
                      <span className={`badge ${precheck.pass ? "badge-consumer-duty-pass" : "badge-consumer-duty-fail"}`}>
                        {precheck.pass ? "Pass" : "Needs revision"}
                      </span>
                    </div>
                    <ul className="fca-precheck-list">
                      <li className={precheck.hasRiskWarning ? "fca-check-pass" : "fca-check-fail"}>
                        {precheck.hasRiskWarning ? "✓" : "✗"} Mandatory risk warning{" "}
                        {precheck.hasRiskWarning
                          ? "present."
                          : "missing — must include: “Don't invest unless you're prepared to lose all the money you invest. This is a high-risk investment and you are unlikely to be protected if something goes wrong.”"}
                      </li>
                      <li className={precheck.matchedIncentives.length === 0 ? "fca-check-pass" : "fca-check-fail"}>
                        {precheck.matchedIncentives.length === 0 ? "✓" : "✗"} Prohibited marketing incentives{" "}
                        {precheck.matchedIncentives.length === 0
                          ? "none detected."
                          : `detected: ${precheck.matchedIncentives.join(", ")}.`}
                      </li>
                    </ul>
                    <p className="muted fca-precheck-note">
                      Rule-based first-pass check against PS23/6 — not a substitute for full 2LoD review.
                    </p>
                  </div>
                )}
              </div>
            )}

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

            <div className="compliance-checklist">
              <span className="step-label">Compliance Pre-Checklist</span>
              <label className="checklist-item">
                <input
                  type="checkbox"
                  checked={checklist.disclosures}
                  onChange={(e) => setChecklist({ ...checklist, disclosures: e.target.checked })}
                />
                Financial Promotions / Risk Disclosures Attached
              </label>
              <label className="checklist-item">
                <input
                  type="checkbox"
                  checked={checklist.targetMarket}
                  onChange={(e) => setChecklist({ ...checklist, targetMarket: e.target.checked })}
                />
                Target Market Classification Confirmed
              </label>
              <label className="checklist-item">
                <input
                  type="checkbox"
                  checked={checklist.jurisdiction}
                  onChange={(e) => setChecklist({ ...checklist, jurisdiction: e.target.checked })}
                />
                Jurisdictional Scope Verification Completed
              </label>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || !checklistComplete}
              title={checklistComplete ? undefined : "Complete the Compliance Pre-Checklist above before submitting"}
            >
              {submitting ? "Starting…" : "Start Process"}
            </button>
            {!checklistComplete && (
              <p className="muted checklist-hint">Complete the checklist above to enable submission.</p>
            )}
          </>
        )}
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
