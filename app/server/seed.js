import { nanoid } from "nanoid";
import { db } from "./db.js";

// Names here must exactly match the keys in AI_REVIEW_CONFIGS (index.js) and
// AI_REVIEW_TEMPLATES (client/src/constants.ts) for the AI-assist buttons to activate.
//
// approverRole values are drawn from one shared vocabulary — Manager, Senior
// Manager, Compliance, Legal, Executive — matching seedUsers.js's seeded
// approver_role values 1:1. Role-gating on the action endpoint depends on
// this alignment: a stage whose approverRole has no matching seeded user is
// a stage nobody can act on. Keep both files in sync if either changes.
const SEED_TEMPLATES = [
  {
    name: "Financial Promotion Review",
    description: "1LoD review of marketing copy against FCA PS23/6",
    stages: [
      { name: "1LoD Operational Review", approverRole: "Manager" },
      { name: "2LoD Compliance Sign-off", approverRole: "Compliance" },
    ],
  },
  {
    name: "Asset Listing Governance Review",
    description: "UK asset listing governance review for new crypto asset listings",
    stages: [
      { name: "1LoD Operational Review", approverRole: "Manager" },
      { name: "2LoD Compliance Sign-off", approverRole: "Compliance" },
    ],
  },
  {
    name: "Regulatory Filing",
    description: "Submission or update to a regulator (e.g. FCA) requiring sign-off before filing",
    stages: [
      { name: "1LoD Operational Review", approverRole: "Manager" },
      { name: "2LoD Compliance Sign-off", approverRole: "Compliance" },
      { name: "Legal Sign-off", approverRole: "Legal" },
    ],
  },
  {
    name: "Existing Process Change",
    description: "Change to an existing approved operational process or control",
    stages: [
      { name: "Manager Review", approverRole: "Manager" },
      { name: "Senior Manager Sign-off", approverRole: "Senior Manager" },
    ],
  },
  {
    name: "Language/Compliance Refresher",
    description: "Routine refresher training or attestation sign-off",
    stages: [{ name: "Manager Sign-off", approverRole: "Manager" }],
  },
];

export function seedTemplates() {
  const existingNames = new Set(db.prepare("SELECT name FROM workflow_templates").all().map((r) => r.name));
  const insert = db.prepare(
    "INSERT INTO workflow_templates (id, name, description, stages, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  for (const t of SEED_TEMPLATES) {
    if (existingNames.has(t.name)) continue;
    insert.run(nanoid(), t.name, t.description, JSON.stringify(t.stages), new Date().toISOString());
    console.log(`Seeded workflow template: ${t.name}`);
  }
}

// Allow standalone `node seed.js` / `npm run seed`, in addition to the
// automatic call from index.js on every server start.
if (import.meta.url === `file://${process.argv[1]}`) {
  seedTemplates();
}
