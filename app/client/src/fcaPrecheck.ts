// FCA PS23/6 stage-1 pre-submission compliance check — a lightweight,
// honest keyword heuristic (same "rule-based mock" contract as
// server/aiReview.js's post-submission review), run entirely client-side so
// a submitter gets feedback before the case even exists. This is
// deliberately separate from the post-submission AI review: it's a draft
// aid, not part of the case record, and nothing here is persisted.

const RISK_WARNING_VARIANTS = [
  "don't invest unless you're prepared to lose all the money you invest",
  "do not invest unless you are prepared to lose all the money you invest",
];

const PROHIBITED_INCENTIVES = [
  "referral bonus",
  "airdrop reward",
  "risk-free",
  "risk free",
  "guaranteed returns",
  "guaranteed return",
];

export interface FcaPrecheckResult {
  hasRiskWarning: boolean;
  matchedIncentives: string[];
  pass: boolean;
}

export function runFcaPrecheck(text: string): FcaPrecheckResult {
  const lower = text.toLowerCase();
  const hasRiskWarning = RISK_WARNING_VARIANTS.some((v) => lower.includes(v));
  const matchedIncentives = PROHIBITED_INCENTIVES.filter((p) => lower.includes(p));
  return { hasRiskWarning, matchedIncentives, pass: hasRiskWarning && matchedIncentives.length === 0 };
}
