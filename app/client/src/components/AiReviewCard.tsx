import type { AiReview } from "../types";

function FinancialPromotionsFields({ output }: { output: Extract<AiReview, { review_type: "financial_promotions" }>["output"] }) {
  return (
    <>
      <dt>Risk Warning Check</dt>
      <dd>
        {output.riskWarningCheck.pass ? "Pass" : "Fail"} — {output.riskWarningCheck.explanation}
      </dd>
      <dt>Banned Incentive Check</dt>
      <dd>
        {output.bannedIncentiveCheck.pass ? "Pass" : "Fail"} — {output.bannedIncentiveCheck.explanation}
      </dd>
      <dt>Flagged Words/Claims</dt>
      <dd>{output.flaggedClaims.length > 0 ? output.flaggedClaims.join(", ") : "None"}</dd>
      <dt>Recommended Redline Copy</dt>
      <dd>{output.recommendedRedline}</dd>
    </>
  );
}

function AssetListingFields({ output }: { output: Extract<AiReview, { review_type: "asset_listing" }>["output"] }) {
  return (
    <>
      <dt>Classification</dt>
      <dd>
        {output.classification} — {output.classificationRationale}
      </dd>
      <dt>High-Risk Disclosures</dt>
      <dd>
        <ul>
          {output.topRisks.map((risk, i) => (
            <li key={i}>{risk}</li>
          ))}
        </ul>
      </dd>
      <dt>Draft UK Asset Factsheet Summary</dt>
      <dd>{output.factsheetSummary}</dd>
      <dt>Flagged Operational Dependencies</dt>
      <dd>{output.flaggedDependencies.join(", ")}</dd>
    </>
  );
}

export function AiReviewCard({ review }: { review: AiReview }) {
  const statusText = review.review_type === "financial_promotions" ? review.output.overallStatus : review.output.classification;
  const statusBadgeClass =
    review.review_type === "financial_promotions"
      ? `badge-status-${statusText.replace(/\s+/g, "-")}`
      : "badge-classification";

  return (
    <div className="ai-review-card">
      <div className="ai-review-card-header">
        {review.is_mock && <span className="badge badge-mock">MOCK — not a real AI call</span>}
        <span className="badge badge-advisory" title="AI output never auto-decides — a human approver always makes the call">
          Advisory only · human sign-off required
        </span>
        <span className={`badge ${statusBadgeClass}`}>{statusText}</span>
        <span className="muted timestamp">{new Date(review.created_at).toLocaleString()}</span>
      </div>
      <dl className="ai-review-fields">
        {review.review_type === "financial_promotions" ? (
          <FinancialPromotionsFields output={review.output} />
        ) : (
          <AssetListingFields output={review.output} />
        )}
      </dl>
    </div>
  );
}
