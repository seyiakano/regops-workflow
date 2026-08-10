// Risk-based dynamic workflow routing — a high-severity case, or an Asset
// Listing case involving a complex product (staking/yield), gets an extra
// "2LoD Legal & Sanctions Review" stage spliced in before the final
// Compliance sign-off. Computed once at case-creation time and snapshotted
// per-instance (see db.js's instances.stages_json) rather than recomputed
// from the template on every read, so a case's routing doesn't silently
// change if severity rules are edited later or content is amended.
//
// Mirrored in client/src/dynamicRouting.ts for the "This process will route
// to:" form preview — keep both in sync if this logic changes.

const RISK_SEVERITIES = new Set(["high", "severe"]);
const COMPLEX_ASSET_KEYWORDS = ["staking", "yield"];
const LEGAL_STAGE = { name: "2LoD Legal & Sanctions Review", approverRole: "Legal" };

export function computeInstanceStages(template, { severity, content }) {
  const baseStages = JSON.parse(template.stages);

  // Only meaningful to insert before an existing Compliance sign-off stage,
  // and only if the chain doesn't already route through Legal (e.g.
  // Regulatory Filing already ends in a Legal Sign-off stage).
  const hasLegalStage = baseStages.some((s) => s.approverRole === "Legal");
  const lastStage = baseStages[baseStages.length - 1];
  const endsInCompliance = lastStage?.approverRole === "Compliance";
  if (hasLegalStage || !endsInCompliance) return baseStages;

  const isHighRisk = RISK_SEVERITIES.has(severity);
  const lowerContent = (content ?? "").toLowerCase();
  const isComplexAsset =
    template.name === "Asset Listing Governance Review" &&
    COMPLEX_ASSET_KEYWORDS.some((k) => lowerContent.includes(k));

  if (!isHighRisk && !isComplexAsset) return baseStages;

  const withLegal = [...baseStages];
  withLegal.splice(withLegal.length - 1, 0, LEGAL_STAGE);
  return withLegal;
}
