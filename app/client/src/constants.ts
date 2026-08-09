// Must match AI_REVIEW_CONFIGS in server/index.js
export const AI_REVIEW_TEMPLATES: Record<
  string,
  { stageIndex: number; reviewType: "financial_promotions" | "asset_listing"; contentLabel: string; contentPlaceholder: string }
> = {
  "Financial Promotion Review": {
    stageIndex: 0,
    reviewType: "financial_promotions",
    contentLabel: "Promotion copy",
    contentPlaceholder: "Paste the marketing copy to be reviewed — enables the AI-assisted first-pass check at stage 1.",
  },
  "Asset Listing Governance Review": {
    stageIndex: 0,
    reviewType: "asset_listing",
    contentLabel: "Asset details / whitepaper summary",
    contentPlaceholder: "Paste the tokenomics summary or whitepaper extract — enables the AI-assisted first-pass check at stage 1.",
  },
};

// Shared wording so the "AI assists, humans decide" principle reads
// identically wherever it's surfaced (AI review cards, the action box, the
// board pack) — this is a deliberate governance statement, not incidental
// copy, and should stay in sync everywhere it appears.
export const AI_OVERSIGHT_STATEMENT =
  "AI output is advisory only. No AI review can approve, reject, or return a case — every decision requires sign-off from an authenticated human approver matching the stage's required role.";

const DEFAULT_CONTENT_LABEL = "Justification";
const DEFAULT_CONTENT_PLACEHOLDER = "Type your comment — describe the specific request. This is what the first approver will see.";

export const SEVERITY_OPTIONS: { value: "severe" | "high" | "low"; label: string }[] = [
  { value: "severe", label: "Severe" },
  { value: "high", label: "High" },
  { value: "low", label: "Low" },
];

export function getContentLabel(templateName: string): string {
  return AI_REVIEW_TEMPLATES[templateName]?.contentLabel ?? DEFAULT_CONTENT_LABEL;
}

export function getContentPlaceholder(templateName: string): string {
  return AI_REVIEW_TEMPLATES[templateName]?.contentPlaceholder ?? DEFAULT_CONTENT_PLACEHOLDER;
}
