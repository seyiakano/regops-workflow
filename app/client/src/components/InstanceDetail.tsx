import { useEffect, useState } from "react";
import { api } from "../api";
import type { WorkflowInstanceDetail } from "../types";
import { StatusBadge } from "./StatusBadge";
import { AiReviewCard } from "./AiReviewCard";
import { AI_REVIEW_TEMPLATES, AI_OVERSIGHT_STATEMENT, getContentLabel } from "../constants";
import { useAuth } from "../auth";

export function InstanceDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { user } = useAuth();
  const [instance, setInstance] = useState<WorkflowInstanceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [aiReviewRunning, setAiReviewRunning] = useState(false);

  async function refresh() {
    try {
      setInstance(await api.getInstance(id));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function act(action: "approve" | "reject" | "return") {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.actionInstance(id, { action, comment });
      setComment("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function runAiReview() {
    setAiReviewRunning(true);
    setError(null);
    try {
      await api.runAiReview(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAiReviewRunning(false);
    }
  }

  if (!instance) return <div className="page">{error ? <p className="error">{error}</p> : <p>Loading…</p>}</div>;

  const aiConfig = AI_REVIEW_TEMPLATES[instance.template_name];
  const canRunAiReview =
    !!aiConfig &&
    instance.current_stage_index === aiConfig.stageIndex &&
    instance.status === "in_progress" &&
    !!instance.content;
  const canAct = !!user && user.approver_role === instance.current_stage?.approverRole;

  return (
    <div className="page">
      <button className="btn-secondary" onClick={onBack}>
        ← Back
      </button>

      <section className="panel">
        <div className="panel-header">
          <h2>
            <span className="case-number">{instance.case_number}</span> {instance.title}
          </h2>
          <div className="panel-header-badges">
            {instance.severity && (
              <span className={`severity-badge severity-${instance.severity}`}>{instance.severity}</span>
            )}
            <StatusBadge status={instance.status} />
          </div>
        </div>
        <p className="muted">
          Process: {instance.template_name} · Submitted by {instance.submitted_by} on{" "}
          {new Date(instance.created_at).toLocaleString()}
        </p>
        {instance.figma_link && (
          <p className="muted">
            Figma:{" "}
            <a href={instance.figma_link} target="_blank" rel="noreferrer">
              {instance.figma_link}
            </a>
          </p>
        )}

        <ol className="stage-progress">
          {instance.stages.map((s, i) => {
            const state =
              instance.status !== "in_progress"
                ? i < instance.current_stage_index || instance.status === "approved"
                  ? "done"
                  : i === instance.current_stage_index
                    ? "current"
                    : "pending"
                : i < instance.current_stage_index
                  ? "done"
                  : i === instance.current_stage_index
                    ? "current"
                    : "pending";
            return (
              <li key={i} className={`stage-step stage-${state}`}>
                <span className="stage-index">{i + 1}</span>
                <div>
                  <div className="stage-name">{s.name}</div>
                  <div className="muted">{s.approverRole}</div>
                </div>
              </li>
            );
          })}
        </ol>

        {instance.content && (
          <div className="promotion-copy">
            <h3>{getContentLabel(instance.template_name)}</h3>
            <p>{instance.content}</p>
          </div>
        )}

        {instance.attachments.length > 0 && (
          <div className="attachments-block">
            <h3>Screenshots / Attachments</h3>
            <ul className="file-list">
              {instance.attachments.map((a) => (
                <li key={a.id}>
                  <a href={a.url} target="_blank" rel="noreferrer">
                    {a.original_name}
                  </a>
                  <span className="muted">{a.uploaded_by}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {canRunAiReview && (
          <div className="ai-review-trigger">
            <button className="btn-secondary" disabled={aiReviewRunning} onClick={runAiReview}>
              {aiReviewRunning ? "Running…" : "Run AI Review"}
            </button>
            <span className="muted">Stubbed rule-based first pass — not a real model call yet.</span>
          </div>
        )}

        {instance.ai_reviews.length > 0 && (
          <div className="ai-review-results">
            <h3>AI Review Results</h3>
            {instance.ai_reviews.map((r) => (
              <AiReviewCard key={r.id} review={r} />
            ))}
          </div>
        )}

        {instance.status === "in_progress" && canAct && (
          <div className="action-box form">
            <h3>Take Action — {instance.current_stage?.name}</h3>
            <p className="muted">Acting as {user?.name}</p>
            {instance.ai_reviews.length > 0 && (
              <p className="ai-oversight-note">{AI_OVERSIGHT_STATEMENT}</p>
            )}
            <label>
              Comment
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
            </label>
            <div className="action-buttons">
              <button className="btn-primary" disabled={submitting} onClick={() => act("approve")}>
                Approve
              </button>
              <button className="btn-secondary" disabled={submitting} onClick={() => act("return")}>
                Return
              </button>
              <button className="btn-danger" disabled={submitting} onClick={() => act("reject")}>
                Reject
              </button>
            </div>
          </div>
        )}
        {instance.status === "in_progress" && !canAct && (
          <div className="action-box">
            <p className="muted">
              This case is awaiting <strong>{instance.current_stage?.approverRole}</strong> approval. You're
              signed in as {user?.name}
              {user?.approver_role ? ` (${user.approver_role})` : " (no approver role)"} — you can't act on
              this stage.
            </p>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="panel">
        <h2>Audit Trail</h2>
        <ul className="audit-trail">
          {instance.audit_log.map((entry) => (
            <li key={entry.id} className="audit-entry">
              <div className="audit-entry-header">
                <strong>{entry.actor}</strong>
                <span className={`badge badge-action-${entry.action}`}>{entry.action}</span>
                <span className="muted">{entry.stage_name}</span>
                <span className="muted timestamp">{new Date(entry.created_at).toLocaleString()}</span>
              </div>
              {entry.comment && <p>{entry.comment}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
