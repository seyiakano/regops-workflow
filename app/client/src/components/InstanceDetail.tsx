import { useEffect, useState } from "react";
import { api } from "../api";
import type { WorkflowInstanceDetail } from "../types";
import { StatusBadge } from "./StatusBadge";
import { SlaBadge } from "./SlaBadge";
import { AiReviewCard } from "./AiReviewCard";
import { AI_REVIEW_TEMPLATES, AI_OVERSIGHT_STATEMENT, getContentLabel } from "../constants";
import { useAuth } from "../auth";

const REVISION_ROLES = new Set(["Manager", "Compliance", "Legal"]);

export function InstanceDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { user } = useAuth();
  const [instance, setInstance] = useState<WorkflowInstanceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [aiReviewRunning, setAiReviewRunning] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [resubmitTitle, setResubmitTitle] = useState("");
  const [resubmitContent, setResubmitContent] = useState("");
  const [resubmitComment, setResubmitComment] = useState("");

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

  useEffect(() => {
    if (instance?.status === "revision_required") {
      setResubmitTitle(instance.title);
      setResubmitContent(instance.content ?? "");
    }
  }, [instance?.status, instance?.id]);

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

  async function submitRevisionRequest() {
    if (!revisionReason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.requestRevision(id, revisionReason.trim());
      setRevisionReason("");
      setShowRevisionModal(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function resubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.resubmitInstance(id, {
        title: resubmitTitle,
        content: resubmitContent,
        comment: resubmitComment || undefined,
      });
      setResubmitComment("");
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
  const roleMatches = !!user && user.approver_role === instance.current_stage?.approverRole;
  const isSelfSubmitted = !!user && user.name === instance.submitted_by;
  // Segregation of duties (maker-checker): the submitter can never act on
  // their own case, even if their role matches the current stage — see the
  // matching guard on the server's /action route.
  const canAct = roleMatches && !isSelfSubmitted;

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
            <SlaBadge status={instance.sla_status} hoursInStage={instance.hours_in_stage} />
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

        {instance.status === "revision_required" && (
          <div className="revision-banner">
            <h3>Revision Requested</h3>
            <p className="muted">
              {instance.revision_requested_by} requested changes on{" "}
              {instance.revision_requested_at && new Date(instance.revision_requested_at).toLocaleString()}:
            </p>
            <p className="revision-reason">"{instance.revision_reason}"</p>
            {!!user && user.name === instance.submitted_by ? (
              <div className="form resubmit-form">
                <label>
                  Case subject
                  <input value={resubmitTitle} onChange={(e) => setResubmitTitle(e.target.value)} />
                </label>
                <label>
                  {getContentLabel(instance.template_name)}
                  <textarea value={resubmitContent} onChange={(e) => setResubmitContent(e.target.value)} rows={4} />
                </label>
                <label>
                  Comment (optional)
                  <textarea value={resubmitComment} onChange={(e) => setResubmitComment(e.target.value)} rows={2} />
                </label>
                <button className="btn-primary" disabled={submitting} onClick={resubmit}>
                  Resubmit Case
                </button>
              </div>
            ) : (
              <p className="muted">Awaiting the submitter ({instance.submitted_by}) to resubmit this case.</p>
            )}
          </div>
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
              {!!user?.approver_role && REVISION_ROLES.has(user.approver_role) && (
                <button
                  className="btn-secondary"
                  disabled={submitting}
                  onClick={() => setShowRevisionModal(true)}
                >
                  Request Revision
                </button>
              )}
              <button className="btn-danger" disabled={submitting} onClick={() => act("reject")}>
                Reject
              </button>
            </div>
          </div>
        )}
        {instance.status === "in_progress" && !canAct && (
          <div className="action-box">
            {roleMatches && isSelfSubmitted ? (
              <p className="muted">
                This case is awaiting <strong>{instance.current_stage?.approverRole}</strong> approval. You
                submitted it yourself — segregation of duties means a different {instance.current_stage?.approverRole}{" "}
                approver has to act on it, even though your role matches this stage.
              </p>
            ) : (
              <p className="muted">
                This case is awaiting <strong>{instance.current_stage?.approverRole}</strong> approval. You're
                signed in as {user?.name}
                {user?.approver_role ? ` (${user.approver_role})` : " (no approver role)"} — you can't act on
                this stage.
              </p>
            )}
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

      {showRevisionModal && (
        <div className="modal-backdrop" onClick={() => setShowRevisionModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Request Revision</h3>
            <label>
              Revision Reason
              <textarea
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
                rows={4}
                placeholder="Explain what needs to change before this case can proceed…"
                autoFocus
              />
            </label>
            <div className="action-buttons">
              <button
                className="btn-primary"
                disabled={submitting || !revisionReason.trim()}
                onClick={submitRevisionRequest}
              >
                {submitting ? "Sending…" : "Send Back for Revision"}
              </button>
              <button className="btn-secondary" onClick={() => setShowRevisionModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
