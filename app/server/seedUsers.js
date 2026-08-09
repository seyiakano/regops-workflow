import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { db } from "./db.js";

// Prototype-only: shared password for every seeded internal user. Not for
// production use — see README / project memory for why this is acceptable
// here (local-only prototype, no real auth requirements given).
export const SEED_PASSWORD = "password123";

// approverRole values must match the approverRole strings used in
// seed.js's template stages exactly (case-sensitive) — the action endpoint
// gates approve/reject/return by comparing them. `null` means the user can
// submit cases but never act as an approver on any stage.
// isAdmin gates the Workflow Templates tab (create/delete process types) —
// "admins/executives only" per user request, treated as the same group here.
const SEED_USERS = [
  { name: "A. Akano", email: "a.akano@coinbase.com", approverRole: null, isAdmin: false },
  { name: "J. Ops Reviewer", email: "j.reviewer@coinbase.com", approverRole: "Manager", isAdmin: false },
  { name: "M. Compliance Officer", email: "m.compliance@coinbase.com", approverRole: "Compliance", isAdmin: false },
  { name: "S. Senior Manager", email: "s.manager@coinbase.com", approverRole: "Senior Manager", isAdmin: false },
  { name: "L. Counsel", email: "l.counsel@coinbase.com", approverRole: "Legal", isAdmin: false },
  { name: "E. Executive", email: "e.exec@coinbase.com", approverRole: "Executive", isAdmin: true },
];

export function seedUsers() {
  const existingEmails = new Set(db.prepare("SELECT email FROM users").all().map((r) => r.email));
  const passwordHash = bcrypt.hashSync(SEED_PASSWORD, 10);
  const insert = db.prepare(
    "INSERT INTO users (id, name, email, password_hash, approver_role, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  for (const u of SEED_USERS) {
    if (existingEmails.has(u.email)) continue;
    insert.run(nanoid(), u.name, u.email, passwordHash, u.approverRole, u.isAdmin ? 1 : 0, new Date().toISOString());
    console.log(`Seeded user: ${u.email}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedUsers();
}
