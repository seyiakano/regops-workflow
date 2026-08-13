import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Vercel's serverless functions get a fresh, read-only filesystem per cold
// start except /tmp — writing there means the DB (and every login/case/audit
// row) resets whenever the function cold-starts. Fine for a demo deploy,
// not for real persistence — see project memory before treating this app's
// Vercel deploy as anything but a clickable demo.
const dbPath = process.env.VERCEL ? "/tmp/data.sqlite" : path.join(__dirname, "data.sqlite");
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS workflow_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    stages TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS instances (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    title TEXT NOT NULL,
    submitted_by TEXT NOT NULL,
    content TEXT,
    figma_link TEXT,
    severity TEXT,
    current_stage_index INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'in_progress',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (template_id) REFERENCES workflow_templates(id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    approver_role TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS case_attachments (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER,
    uploaded_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (instance_id) REFERENCES instances(id)
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL,
    stage_name TEXT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    comment TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (instance_id) REFERENCES instances(id)
  );

  CREATE TABLE IF NOT EXISTS ai_reviews (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL,
    stage_name TEXT NOT NULL,
    review_type TEXT NOT NULL,
    is_mock INTEGER NOT NULL DEFAULT 1,
    output_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (instance_id) REFERENCES instances(id)
  );

  -- Product Governance / launch readiness — deliberately a SEPARATE shape
  -- from workflow_templates/instances: readiness gates are checked off in
  -- parallel by whichever role owns each one (not a single-file sequential
  -- chain), because that's how coordinating a launch against a target date
  -- actually works. See launchReadiness.js.
  CREATE TABLE IF NOT EXISTS launch_items (
    id TEXT PRIMARY KEY,
    product_name TEXT NOT NULL,
    description TEXT,
    target_launch_date TEXT NOT NULL,
    submitted_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS launch_gates (
    id TEXT PRIMARY KEY,
    launch_item_id TEXT NOT NULL,
    gate_name TEXT NOT NULL,
    approver_role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    actor TEXT,
    comment TEXT,
    decided_at TEXT,
    FOREIGN KEY (launch_item_id) REFERENCES launch_items(id)
  );

  -- Simulated external-system integration log (Slack + deploy-trigger
  -- webhooks). No real Slack app or CI/CD credentials exist for this
  -- prototype (see project memory: ask before wiring paid/keyed services) —
  -- this table records the exact payload/contract that WOULD be sent so the
  -- integration boundary is demonstrable without a live external system.
  CREATE TABLE IF NOT EXISTS integration_events (
    id TEXT PRIMARY KEY,
    instance_id TEXT,
    direction TEXT NOT NULL,
    event_type TEXT NOT NULL,
    target TEXT NOT NULL,
    summary TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (instance_id) REFERENCES instances(id)
  );
`);

// stages_json: a per-instance SNAPSHOT of the stage chain, computed once at
// creation time by dynamicRouting.js (e.g. a high-severity or complex-asset
// case gets an extra Legal stage spliced in). Nullable — null means "use the
// template's default stages", which keeps every row created before this
// column existed working unchanged. Added via ALTER rather than the CREATE
// TABLE above so it applies to already-provisioned databases too.
const hasStagesJson = db
  .prepare("SELECT 1 FROM pragma_table_info('instances') WHERE name = 'stages_json'")
  .get();
if (!hasStagesJson) {
  db.exec("ALTER TABLE instances ADD COLUMN stages_json TEXT");
}

// Per-case SLA target, defaulting to 24h/stage — see dynamicRouting-style
// ALTER-if-missing pattern above. "Time in current stage" is derived from
// instances.updated_at at read time rather than stored, since updated_at is
// already the exact moment the case entered its current stage (see the
// /action route) and resubmitting after a revision naturally resets it.
const hasSlaTargetHours = db
  .prepare("SELECT 1 FROM pragma_table_info('instances') WHERE name = 'sla_target_hours'")
  .get();
if (!hasSlaTargetHours) {
  db.exec("ALTER TABLE instances ADD COLUMN sla_target_hours INTEGER NOT NULL DEFAULT 24");
}

// Revision loop (Feature 4) — request-info-style return to the submitter,
// distinct from the existing stage-by-stage "return" action: always goes to
// the submitter regardless of stage, requires a reason, and remembers which
// stage to resume at (and resets that stage's SLA clock) on resubmission.
const hasRevisionReason = db
  .prepare("SELECT 1 FROM pragma_table_info('instances') WHERE name = 'revision_reason'")
  .get();
if (!hasRevisionReason) {
  db.exec(`
    ALTER TABLE instances ADD COLUMN revision_reason TEXT;
    ALTER TABLE instances ADD COLUMN revision_requested_by TEXT;
    ALTER TABLE instances ADD COLUMN revision_requested_at TEXT;
    ALTER TABLE instances ADD COLUMN revision_target_stage_index INTEGER;
  `);
}
