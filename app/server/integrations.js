// Simulated external-system integration boundary — Slack notifications and
// "push to production" deploy triggers. No real Slack app or CI/CD/feature-
// flag credentials exist for this prototype (ask before wiring paid/keyed
// services — see project memory), so nothing here makes a real network call.
// Instead every simulated call is logged to integration_events with the
// exact payload/contract a real integration would send, so the integration
// design is demonstrable without a live external system.

import { nanoid } from "nanoid";
import { db } from "./db.js";

const now = () => new Date().toISOString();

export const SLACK_CHANNEL = "#regops-review";
export const SLACK_INTAKE_CHANNEL = "#regops-intake";
export const VOICE_INTAKE_SOURCE = "Web Speech API (browser, on-device transcription)";
export const ESCALATION_TARGET = "2LoD Leadership";

// What a final approval on each workflow template actually rolls out to.
// Deliberately different per template — "approved" means publish marketing
// copy, list an asset, submit a regulatory filing, ship a process change,
// or publish an attestation, not one generic "deploy" action. A real rollout
// would need a scoped, least-privilege service-account credential per
// target, issued by whichever team owns that system — not a shared one.
export const DEPLOY_TARGETS = {
  "Financial Promotion Review": {
    system: "Marketing CMS",
    endpoint: "https://cms.internal/api/promotions/:id/publish",
    action: "publish_promotion",
  },
  "Asset Listing Governance Review": {
    system: "Exchange Listing Service",
    endpoint: "https://listing-service.internal/api/assets/:id/list",
    action: "list_asset",
  },
  "Regulatory Filing": {
    system: "Regulatory Filing Portal",
    endpoint: "https://fca-portal.internal/api/filings/:id/submit",
    action: "submit_filing",
  },
  "Existing Process Change": {
    system: "CI/CD Pipeline",
    endpoint: "https://ci.internal/api/workflows/process-change/dispatch",
    action: "workflow_dispatch",
  },
  "Language/Compliance Refresher": {
    system: "LMS (Learning Management System)",
    endpoint: "https://lms.internal/api/attestations/:id/publish",
    action: "publish_attestation",
  },
};

function logEvent({ instanceId = null, direction, eventType, target, summary, payload }) {
  const id = nanoid();
  db.prepare(
    `INSERT INTO integration_events (id, instance_id, direction, event_type, target, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, instanceId, direction, eventType, target, summary, JSON.stringify(payload), now());
  return id;
}

export function simulateSlackSubmitNotification({ instance, templateName, caseNumber, sourceLabel }) {
  const payload = {
    channel: SLACK_CHANNEL,
    text: `New case submitted: ${caseNumber} — ${instance.title}`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*New case submitted*\n${caseNumber} — ${instance.title}` },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${templateName} · Submitted by ${instance.submitted_by}${sourceLabel ? ` (via ${sourceLabel})` : ""} · Severity: ${
              instance.severity ?? "n/a"
            }`,
          },
        ],
      },
    ],
  };
  return logEvent({
    instanceId: instance.id,
    direction: "outbound",
    eventType: "slack_notification",
    target: SLACK_CHANNEL,
    summary: `Posted "${caseNumber} submitted" to ${SLACK_CHANNEL}`,
    payload,
  });
}

const DECISION_VERBS = {
  approved: "approved ✅",
  rejected: "rejected ❌",
  returned_to_submitter: "returned to submitter ↩️",
};

export function simulateSlackDecisionNotification({ instance, templateName, caseNumber, status, actor }) {
  const verb = DECISION_VERBS[status] ?? status;
  const payload = {
    channel: SLACK_CHANNEL,
    text: `${caseNumber} ${verb} by ${actor}`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*${caseNumber}* ${verb}\n${instance.title} (${templateName})` },
      },
      { type: "context", elements: [{ type: "mrkdwn", text: `Decision by ${actor}` }] },
    ],
  };
  return logEvent({
    instanceId: instance.id,
    direction: "outbound",
    eventType: "slack_notification",
    target: SLACK_CHANNEL,
    summary: `Posted "${caseNumber} ${status}" to ${SLACK_CHANNEL}`,
    payload,
  });
}

export function simulateDeployTrigger({ instance, templateName, caseNumber }) {
  const target = DEPLOY_TARGETS[templateName];
  if (!target) return null;
  const payload = {
    method: "POST",
    endpoint: target.endpoint.replace(":id", instance.id),
    headers: {
      Authorization: "Bearer <scoped-service-account-token>",
      "Idempotency-Key": `${instance.id}-final-approval`,
    },
    body: { action: target.action, case_number: caseNumber, title: instance.title, approved_via: "RegOps Flow" },
  };
  return logEvent({
    instanceId: instance.id,
    direction: "outbound",
    eventType: "deploy_trigger",
    target: target.system,
    summary: `Triggered ${target.action} on ${target.system} for ${caseNumber}`,
    payload,
  });
}

export function simulateLaunchReadyTrigger({ launchItem }) {
  const payload = {
    method: "POST",
    endpoint: `https://feature-flags.internal/api/flags/${launchItem.id}/enable`,
    headers: {
      Authorization: "Bearer <scoped-service-account-token>",
      "Idempotency-Key": `${launchItem.id}-go-live`,
    },
    body: { action: "enable_flag", product_name: launchItem.product_name, approved_via: "RegOps Flow" },
  };
  return logEvent({
    direction: "outbound",
    eventType: "deploy_trigger",
    target: "Feature Flag Service",
    summary: `Triggered enable_flag on Feature Flag Service for "${launchItem.product_name}"`,
    payload,
  });
}

export function simulateSlackInboundCase({ instanceId, templateName, title, slackUser }) {
  const payload = {
    type: "slash_command_simulation",
    command: "/regops new-case",
    channel_name: SLACK_INTAKE_CHANNEL,
    user_name: slackUser,
    text: `${templateName} | ${title}`,
  };
  return logEvent({
    instanceId,
    direction: "inbound",
    eventType: "slack_inbound",
    target: SLACK_INTAKE_CHANNEL,
    summary: `Received /regops new-case from @${slackUser}: "${title}"`,
    payload,
  });
}

// Unlike the Slack functions above, this one is NOT simulated — the
// transcript was really produced by the browser's Web Speech API on the
// submitter's own device (no external STT/LLM service or API key involved),
// and the case was really created from it. Logged here purely so this
// intake channel shows up in the same activity feed as the others.
export function logVoiceIntakeEvent({ instanceId, templateName, title, submittedBy, transcript, autoDetected }) {
  const payload = {
    type: "voice_note_transcription",
    input_method: VOICE_INTAKE_SOURCE,
    transcript,
    auto_detected: autoDetected,
    submitted_by: submittedBy,
  };
  return logEvent({
    instanceId,
    direction: "inbound",
    eventType: "voice_intake",
    target: VOICE_INTAKE_SOURCE,
    summary: `Voice-drafted case from ${submittedBy}: "${title}" (${templateName})`,
    payload,
  });
}

// Simulated SLA-breach escalation — same simulation contract as the Slack
// functions above: no real paging/notification system is wired up, so this
// logs the notice 2LoD Leadership would receive rather than sending one.
export function simulateEscalationNotice({ instance, caseNumber, stageName, hoursInStage, triggeredBy }) {
  const payload = {
    to: ESCALATION_TARGET,
    subject: `SLA breach: ${caseNumber} — ${instance.title}`,
    body: `${caseNumber} has been sitting in "${stageName}" for ${
      hoursInStage != null ? `${hoursInStage}h` : "longer than the configured SLA"
    }, past the configured SLA threshold. Escalated by ${triggeredBy}.`,
    case_number: caseNumber,
    stage_name: stageName,
    triggered_by: triggeredBy,
  };
  return logEvent({
    instanceId: instance.id,
    direction: "outbound",
    eventType: "escalation_notice",
    target: ESCALATION_TARGET,
    summary: `Escalation notice sent to ${ESCALATION_TARGET} for ${caseNumber} (${stageName})`,
    payload,
  });
}

export function listIntegrationEvents({ limit = 50 } = {}) {
  const rows = db
    .prepare(
      `SELECT ie.*, i.title as case_title, i.rowid as case_rowid
       FROM integration_events ie
       LEFT JOIN instances i ON i.id = ie.instance_id
       ORDER BY ie.created_at DESC LIMIT ?`
    )
    .all(limit);
  return rows.map((r) => ({
    id: r.id,
    instance_id: r.instance_id,
    case_number: r.case_rowid ? `CASE-${String(r.case_rowid).padStart(6, "0")}` : null,
    case_title: r.case_title,
    direction: r.direction,
    event_type: r.event_type,
    target: r.target,
    summary: r.summary,
    payload: JSON.parse(r.payload_json),
    created_at: r.created_at,
  }));
}
