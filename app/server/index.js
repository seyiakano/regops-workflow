import express from "express";
import cors from "cors";
import multer from "multer";
import bcrypt from "bcryptjs";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import { db } from "./db.js";
import { runFinancialPromotionsReview, runAssetListingReview } from "./aiReview.js";
import { generateExecutiveBriefing } from "./executiveBriefing.js";
import { queryAuditLog, getAuditSummary, buildAuditWorkbook } from "./auditReport.js";
import { getDailyTrend } from "./statsTrend.js";
import { getCycleTimeMetrics } from "./cycleTime.js";
import { createLaunchItem, actionGate, serializeLaunchItem } from "./launchReadiness.js";
import { createSession, destroySession, requireAuth, requireAdmin } from "./auth.js";
import { seedTemplates } from "./seed.js";
import { seedUsers } from "./seedUsers.js";

seedTemplates();
seedUsers();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Same read-only-filesystem constraint as db.js — uploaded files land in
// /tmp on Vercel and won't survive a cold start.
const UPLOADS_DIR = process.env.VERCEL ? "/tmp/uploads" : path.join(__dirname, "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => cb(null, `${nanoid()}-${file.originalname}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file, prototype scope
});

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));

const now = () => new Date().toISOString();

// AI-assist is hardcoded per template name + stage index, per current scope
// (no generic per-stage flag on templates yet). Keep this in sync with
// app/client/src/constants.ts's AI_REVIEW_TEMPLATES.
const AI_REVIEW_CONFIGS = {
  "Financial Promotion Review": {
    stageIndex: 0,
    reviewType: "financial_promotions",
    run: runFinancialPromotionsReview,
    summarize: (output) => output.overallStatus,
  },
  "Asset Listing Governance Review": {
    stageIndex: 0,
    reviewType: "asset_listing",
    run: runAssetListingReview,
    summarize: (output) => `Classification: ${output.classification}`,
  },
};

function serializeTemplate(row) {
  return { ...row, stages: JSON.parse(row.stages) };
}

function serializeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    approver_role: row.approver_role,
    is_admin: !!row.is_admin,
  };
}

// ---- Auth ----
// Real (server-verified) sessions — see auth.js. /api/login is the only
// public route; everything else under /api requires a valid bearer token.

app.post("/api/login", (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  const token = createSession(user.id);
  res.json({ token, user: serializeUser(user) });
});

app.use("/api", requireAuth);

app.post("/api/logout", (req, res) => {
  destroySession(req.sessionToken);
  res.status(204).end();
});

app.get("/api/me", (req, res) => {
  res.json(serializeUser(req.user));
});

app.get("/api/users", (req, res) => {
  const rows = db.prepare("SELECT * FROM users ORDER BY name ASC").all();
  res.json(rows.map(serializeUser));
});

// ---- Workflow templates ----
// Create/delete are admin-only — everyone can still read them (needed to
// populate the process-type picker on the submit form).

app.get("/api/templates", (req, res) => {
  const rows = db.prepare("SELECT * FROM workflow_templates ORDER BY created_at DESC").all();
  res.json(rows.map(serializeTemplate));
});

app.get("/api/templates/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM workflow_templates WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Template not found" });
  res.json(serializeTemplate(row));
});

app.post("/api/templates", requireAdmin, (req, res) => {
  const { name, description, stages } = req.body;
  if (!name || !Array.isArray(stages) || stages.length === 0) {
    return res.status(400).json({ error: "name and at least one stage are required" });
  }
  for (const stage of stages) {
    if (!stage.name || !stage.approverRole) {
      return res.status(400).json({ error: "each stage needs a name and approverRole" });
    }
  }
  const id = nanoid();
  db.prepare(
    "INSERT INTO workflow_templates (id, name, description, stages, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, name, description ?? "", JSON.stringify(stages), now());
  res.status(201).json(serializeTemplate(db.prepare("SELECT * FROM workflow_templates WHERE id = ?").get(id)));
});

app.delete("/api/templates/:id", requireAdmin, (req, res) => {
  const inUse = db.prepare("SELECT COUNT(*) as n FROM instances WHERE template_id = ?").get(req.params.id);
  if (inUse.n > 0) {
    return res.status(409).json({ error: "Template has instances and cannot be deleted" });
  }
  db.prepare("DELETE FROM workflow_templates WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// ---- Instances ----

// Human-readable Case ID derived from SQLite's implicit rowid — no separate
// counter/column needed, stable and sequential as long as rows aren't deleted
// (instances never are, see schema).
function caseNumber(rowid) {
  return `CASE-${String(rowid).padStart(6, "0")}`;
}

function serializeInstance(row) {
  const template = serializeTemplate(db.prepare("SELECT * FROM workflow_templates WHERE id = ?").get(row.template_id));
  const stage = template.stages[row.current_stage_index] ?? null;
  return {
    ...row,
    case_number: caseNumber(row.rowid),
    template_name: template.name,
    stages: template.stages,
    current_stage: stage,
  };
}

app.get("/api/instances", (req, res) => {
  const { status, q, template_id } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const clauses = [];
  const params = [];
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  if (template_id) {
    clauses.push("template_id = ?");
    params.push(template_id);
  }
  if (q) {
    clauses.push("(title LIKE ? OR submitted_by LIKE ? OR ('CASE-' || printf('%06d', rowid)) LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const total = db.prepare(`SELECT COUNT(*) as n FROM instances ${where}`).get(...params).n;
  const rows = db
    .prepare(`SELECT rowid, * FROM instances ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  res.json({ items: rows.map(serializeInstance), total, limit, offset });
});

app.get("/api/instances/:id", (req, res) => {
  const row = db.prepare("SELECT rowid, * FROM instances WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Instance not found" });
  const audit = db
    .prepare("SELECT * FROM audit_log WHERE instance_id = ? ORDER BY created_at ASC")
    .all(req.params.id);
  const aiReviews = db
    .prepare("SELECT * FROM ai_reviews WHERE instance_id = ? ORDER BY created_at ASC")
    .all(req.params.id)
    .map((r) => ({ ...r, output: JSON.parse(r.output_json), is_mock: !!r.is_mock }));
  const attachments = db
    .prepare("SELECT * FROM case_attachments WHERE instance_id = ? ORDER BY created_at ASC")
    .all(req.params.id)
    .map((a) => ({ ...a, url: `/uploads/${a.stored_name}` }));
  res.json({ ...serializeInstance(row), audit_log: audit, ai_reviews: aiReviews, attachments });
});

app.post("/api/instances/:id/attachments", upload.array("files", 10), (req, res) => {
  const instance = db.prepare("SELECT id FROM instances WHERE id = ?").get(req.params.id);
  if (!instance) return res.status(404).json({ error: "Instance not found" });
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const ts = now();
  const insert = db.prepare(
    `INSERT INTO case_attachments (id, instance_id, original_name, stored_name, mime_type, size_bytes, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const saved = req.files.map((f) => {
    const id = nanoid();
    insert.run(id, req.params.id, f.originalname, f.filename, f.mimetype, f.size, req.user.name, ts);
    return { id, original_name: f.originalname, url: `/uploads/${f.filename}` };
  });

  res.status(201).json(saved);
});

const VALID_SEVERITIES = new Set(["severe", "high", "low"]);

app.post("/api/instances", (req, res) => {
  const { template_id, title, content, figma_link, severity } = req.body;
  if (!template_id || !title) {
    return res.status(400).json({ error: "template_id and title are required" });
  }
  if (severity && !VALID_SEVERITIES.has(severity)) {
    return res.status(400).json({ error: "severity must be one of severe, high, low" });
  }
  const template = db.prepare("SELECT * FROM workflow_templates WHERE id = ?").get(template_id);
  if (!template) return res.status(404).json({ error: "Template not found" });

  const submittedBy = req.user.name;
  const id = nanoid();
  const ts = now();
  db.prepare(
    `INSERT INTO instances (id, template_id, title, submitted_by, content, figma_link, severity, current_stage_index, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'in_progress', ?, ?)`
  ).run(id, template_id, title, submittedBy, content ?? null, figma_link ?? null, severity ?? null, ts, ts);

  const stages = JSON.parse(template.stages);
  db.prepare(
    `INSERT INTO audit_log (id, instance_id, stage_name, actor, action, comment, created_at)
     VALUES (?, ?, ?, ?, 'submit', ?, ?)`
  ).run(nanoid(), id, stages[0]?.name ?? null, submittedBy, `Submitted for review: ${title}`, ts);

  res.status(201).json(serializeInstance(db.prepare("SELECT rowid, * FROM instances WHERE id = ?").get(id)));
});

const VALID_ACTIONS = new Set(["approve", "reject", "return"]);

app.post("/api/instances/:id/action", (req, res) => {
  const { action, comment } = req.body;
  if (!VALID_ACTIONS.has(action)) {
    return res.status(400).json({ error: "action must be approve, reject, or return" });
  }

  const instance = db.prepare("SELECT * FROM instances WHERE id = ?").get(req.params.id);
  if (!instance) return res.status(404).json({ error: "Instance not found" });
  if (instance.status !== "in_progress") {
    return res.status(409).json({ error: `Instance is already ${instance.status} and cannot be actioned` });
  }

  const template = db.prepare("SELECT * FROM workflow_templates WHERE id = ?").get(instance.template_id);
  const stages = JSON.parse(template.stages);
  const currentStage = stages[instance.current_stage_index];

  // Role gate: only a user whose approver_role matches the current stage's
  // required role may act on it. req.user comes from the verified session,
  // not anything client-supplied — this is what actually enforces it.
  if (req.user.approver_role !== currentStage?.approverRole) {
    return res.status(403).json({
      error: `Only ${currentStage?.approverRole} approvers can act on this stage. ${req.user.name} is ${
        req.user.approver_role ? `a ${req.user.approver_role} approver` : "not an approver"
      }.`,
    });
  }

  const actor = req.user.name;
  let nextIndex = instance.current_stage_index;
  let nextStatus = instance.status;

  if (action === "approve") {
    if (instance.current_stage_index === stages.length - 1) {
      nextStatus = "approved";
    } else {
      nextIndex = instance.current_stage_index + 1;
    }
  } else if (action === "reject") {
    nextStatus = "rejected";
  } else if (action === "return") {
    if (instance.current_stage_index === 0) {
      nextStatus = "returned_to_submitter";
    } else {
      nextIndex = instance.current_stage_index - 1;
    }
  }

  const ts = now();
  db.prepare(
    `UPDATE instances SET current_stage_index = ?, status = ?, updated_at = ? WHERE id = ?`
  ).run(nextIndex, nextStatus, ts, instance.id);

  db.prepare(
    `INSERT INTO audit_log (id, instance_id, stage_name, actor, action, comment, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(nanoid(), instance.id, currentStage?.name ?? null, actor, action, comment ?? "", ts);

  res.json(serializeInstance(db.prepare("SELECT rowid, * FROM instances WHERE id = ?").get(instance.id)));
});

// ---- Notifications ----
// In-app only — real email needs SMTP credentials nobody's provided (see
// project memory: ask before wiring paid/keyed services). This counts cases
// currently sitting at a stage the logged-in user is the approver for.

app.get("/api/notifications/count", (req, res) => {
  if (!req.user.approver_role) return res.json({ count: 0 });
  const rows = db.prepare("SELECT * FROM instances WHERE status = 'in_progress'").all();
  let count = 0;
  for (const r of rows) {
    const template = db.prepare("SELECT stages FROM workflow_templates WHERE id = ?").get(r.template_id);
    const stages = JSON.parse(template.stages);
    if (stages[r.current_stage_index]?.approverRole === req.user.approver_role) count++;
  }
  res.json({ count });
});

// ---- Reviewer board stats ----

const PERIOD_DAYS = { today: 1, week: 7, month: 30 };

app.get("/api/stats", (req, res) => {
  const period = req.query.period ?? "all";
  let rows;
  if (period === "all" || !PERIOD_DAYS[period]) {
    rows = db.prepare("SELECT status, template_id FROM instances").all();
  } else {
    const cutoff = new Date(Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000).toISOString();
    rows = db.prepare("SELECT status, template_id FROM instances WHERE created_at >= ?").all(cutoff);
  }

  const byStatus = { pending: 0, approved: 0, rejected: 0, returned: 0 };
  for (const r of rows) {
    if (r.status === "in_progress") byStatus.pending++;
    else if (r.status === "approved") byStatus.approved++;
    else if (r.status === "rejected") byStatus.rejected++;
    else if (r.status === "returned_to_submitter") byStatus.returned++;
  }

  const templates = db.prepare("SELECT id, name FROM workflow_templates").all();
  const templateNameById = Object.fromEntries(templates.map((t) => [t.id, t.name]));
  const byType = {};
  for (const r of rows) {
    const name = templateNameById[r.template_id] ?? "Unknown";
    byType[name] = (byType[name] ?? 0) + 1;
  }

  res.json({
    period,
    total: rows.length,
    byStatus,
    byType: Object.entries(byType)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  });
});

app.get("/api/stats/trend", (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 180);
  res.json({ days, series: getDailyTrend(days) });
});

app.get("/api/stats/cycle-time", (req, res) => {
  const slaHours = Math.min(Math.max(parseInt(req.query.slaHours, 10) || 48, 1), 720);
  res.json(getCycleTimeMetrics(slaHours));
});

// ---- Audit trail BI ----

app.get("/api/audit", (req, res) => {
  const { from, to, template_id, action, q } = req.query;
  const rows = queryAuditLog({ from, to, template_id, action, q });
  res.json({ rows, summary: getAuditSummary(rows) });
});

app.get("/api/audit/export", async (req, res) => {
  const { from, to, template_id, action, q } = req.query;
  const workbook = await buildAuditWorkbook({ from, to, template_id, action, q });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="regops-audit-export-${now().slice(0, 10)}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

// ---- AI-assisted review (stubbed — see ./aiReview.js) ----

app.post("/api/instances/:id/ai-review", (req, res) => {
  const instance = db.prepare("SELECT * FROM instances WHERE id = ?").get(req.params.id);
  if (!instance) return res.status(404).json({ error: "Instance not found" });

  const template = db.prepare("SELECT * FROM workflow_templates WHERE id = ?").get(instance.template_id);
  const config = AI_REVIEW_CONFIGS[template.name];
  if (!config || instance.current_stage_index !== config.stageIndex || instance.status !== "in_progress") {
    const supported = Object.keys(AI_REVIEW_CONFIGS).join(", ");
    return res.status(409).json({
      error: `AI-assisted review is only available on stage 1 of: ${supported} (while in progress).`,
    });
  }
  if (!instance.content) {
    return res.status(400).json({ error: "This item has no content attached to review." });
  }

  const output = config.run(instance.content);
  const stages = JSON.parse(template.stages);
  const stageName = stages[instance.current_stage_index].name;

  const id = nanoid();
  const ts = now();
  db.prepare(
    `INSERT INTO ai_reviews (id, instance_id, stage_name, review_type, is_mock, output_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, instance.id, stageName, config.reviewType, output.mock ? 1 : 0, JSON.stringify(output), ts);

  db.prepare(
    `INSERT INTO audit_log (id, instance_id, stage_name, actor, action, comment, created_at)
     VALUES (?, ?, ?, 'AI Assistant (mock)', 'ai_review', ?, ?)`
  ).run(nanoid(), instance.id, stageName, `Automated first-pass result: ${config.summarize(output)}`, ts);

  res.status(201).json({
    id,
    instance_id: instance.id,
    stage_name: stageName,
    review_type: config.reviewType,
    is_mock: output.mock,
    output,
    created_at: ts,
  });
});

// ---- Executive briefing (real live metrics + templated narrative — see ./executiveBriefing.js) ----

app.post("/api/executive-briefing", (req, res) => {
  const { notes } = req.body ?? {};
  res.json(generateExecutiveBriefing(notes));
});

// ---- Product Governance / launch readiness ----
// A distinct shape from workflow_templates/instances on purpose — readiness
// gates are checked off in parallel by whichever role owns each one, not a
// single sequential chain. See ./launchReadiness.js.

app.get("/api/launch-items", (req, res) => {
  const rows = db.prepare("SELECT * FROM launch_items ORDER BY target_launch_date ASC").all();
  res.json(rows.map(serializeLaunchItem));
});

app.get("/api/launch-items/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM launch_items WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Launch item not found" });
  res.json(serializeLaunchItem(row));
});

app.post("/api/launch-items", (req, res) => {
  const { product_name, description, target_launch_date } = req.body;
  if (!product_name || !target_launch_date) {
    return res.status(400).json({ error: "product_name and target_launch_date are required" });
  }
  const id = createLaunchItem({
    productName: product_name,
    description,
    targetLaunchDate: target_launch_date,
    submittedBy: req.user.name,
  });
  res.status(201).json(serializeLaunchItem(db.prepare("SELECT * FROM launch_items WHERE id = ?").get(id)));
});

const VALID_GATE_ACTIONS = new Set(["approved", "blocked"]);

app.post("/api/launch-items/:id/gates/:gateId/action", (req, res) => {
  const { action, comment } = req.body;
  if (!VALID_GATE_ACTIONS.has(action)) {
    return res.status(400).json({ error: "action must be approved or blocked" });
  }
  const gate = db
    .prepare("SELECT * FROM launch_gates WHERE id = ? AND launch_item_id = ?")
    .get(req.params.gateId, req.params.id);
  if (!gate) return res.status(404).json({ error: "Gate not found" });

  // Same role-gate discipline as the main approval engine's /action route —
  // enforced server-side against the verified session, not client-supplied.
  if (req.user.approver_role !== gate.approver_role) {
    return res.status(403).json({
      error: `Only ${gate.approver_role} approvers can act on this gate. ${req.user.name} is ${
        req.user.approver_role ? `a ${req.user.approver_role} approver` : "not an approver"
      }.`,
    });
  }

  actionGate({ launchItemId: req.params.id, gateId: req.params.gateId, action, actor: req.user.name, comment });
  const item = db.prepare("SELECT * FROM launch_items WHERE id = ?").get(req.params.id);
  res.json(serializeLaunchItem(item));
});

// ---- Production static serving ----
// When built (NODE_ENV=production), serve the client's built assets from
// this same process/port instead of relying on two dev servers + a Vite
// proxy — this is what makes it possible to point one intranet hostname at
// a single running process. See app/package.json's "build"/"start:prod".
if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(__dirname, "..", "client", "dist");
  app.use(express.static(clientDist));
  app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Vercel imports this file as a serverless function and calls the exported
// app directly (Express's app is itself a valid (req, res) handler) — it
// must NOT also bind a port, so the local listener is guarded out.
if (!process.env.VERCEL) {
  const PORT = process.env.NODE_ENV === "production" ? process.env.PORT || 4001 : 4001;
  app.listen(PORT, () => {
    console.log(`RegOps workflow API listening on http://localhost:${PORT}`);
  });
}

export default app;
