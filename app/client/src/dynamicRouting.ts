import type { Severity, Stage, WorkflowTemplate } from "./types";

// Mirrors server/dynamicRouting.js's computeInstanceStages — used here only
// to render a live "This process will route to:" preview before a case
// exists; the server recomputes and snapshots the authoritative version at
// creation time. Keep both in sync if this logic changes.

const RISK_SEVERITIES = new Set(["high", "severe"]);
const COMPLEX_ASSET_KEYWORDS = ["staking", "yield"];
const LEGAL_STAGE: Stage = { name: "2LoD Legal & Sanctions Review", approverRole: "Legal" };

export function computePreviewStages(
  template: WorkflowTemplate,
  { severity, content }: { severity: Severity | ""; content: string }
): Stage[] {
  const baseStages = template.stages;

  const hasLegalStage = baseStages.some((s) => s.approverRole === "Legal");
  const lastStage = baseStages[baseStages.length - 1];
  const endsInCompliance = lastStage?.approverRole === "Compliance";
  if (hasLegalStage || !endsInCompliance) return baseStages;

  const isHighRisk = RISK_SEVERITIES.has(severity);
  const lowerContent = content.toLowerCase();
  const isComplexAsset =
    template.name === "Asset Listing Governance Review" &&
    COMPLEX_ASSET_KEYWORDS.some((k) => lowerContent.includes(k));

  if (!isHighRisk && !isComplexAsset) return baseStages;

  const withLegal = [...baseStages];
  withLegal.splice(withLegal.length - 1, 0, LEGAL_STAGE);
  return withLegal;
}
