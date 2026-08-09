// Stubbed financial-promotions review, following the structure of
// ../../prompts/financial-promotions-review.md. This is a rule-based mock,
// NOT a real model call — swap the body of runFinancialPromotionsReview for
// an Anthropic API call later without touching any caller.

const RISK_WARNING_PHRASES = [
  "capital at risk",
  "risk warning",
  "value of investments can go down as well as up",
  "don't invest unless you're prepared to lose all the money",
  "do not invest unless you are prepared to lose all the money",
];

const BANNED_INCENTIVE_PHRASES = [
  "refer a friend",
  "refer-a-friend",
  "invite a friend",
  "free crypto",
  "bonus when you sign up",
  "sign-up bonus",
  "earn free",
  "welcome bonus",
];

const UNSUBSTANTIATED_CLAIM_PHRASES = [
  "guaranteed",
  "risk-free",
  "risk free",
  "zero risk",
  "no risk",
  "guaranteed returns",
  "can't lose",
  "cannot lose",
];

function findMatches(text, phrases) {
  const lower = text.toLowerCase();
  return phrases.filter((p) => lower.includes(p));
}

export function runFinancialPromotionsReview(copyText) {
  const text = copyText ?? "";

  const riskWarningMatches = findMatches(text, RISK_WARNING_PHRASES);
  const riskWarningPass = riskWarningMatches.length > 0;

  const bannedIncentiveMatches = findMatches(text, BANNED_INCENTIVE_PHRASES);
  const bannedIncentivePass = bannedIncentiveMatches.length === 0;

  const flaggedClaims = findMatches(text, UNSUBSTANTIATED_CLAIM_PHRASES);

  let overallStatus;
  if (!bannedIncentivePass) {
    overallStatus = "REJECT";
  } else if (!riskWarningPass || flaggedClaims.length > 0) {
    overallStatus = "REVISION REQUIRED";
  } else {
    overallStatus = "PASS";
  }

  const redlineNotes = [];
  if (!riskWarningPass) {
    redlineNotes.push(
      "Add the prescribed FCA risk warning, clearly and prominently (e.g. \"Don't invest unless you're prepared to lose all the money you invest. This is a high-risk investment and you are unlikely to be protected if something goes wrong.\")."
    );
  }
  if (!bannedIncentivePass) {
    redlineNotes.push(
      `Remove the prohibited incentive language (matched: ${bannedIncentiveMatches.join(", ")}) — refer-a-friend and free-asset onboarding rewards are banned for cryptoasset promotions.`
    );
  }
  if (flaggedClaims.length > 0) {
    redlineNotes.push(
      `Balance or remove unsubstantiated claims (matched: ${flaggedClaims.join(", ")}) with a clear risk disclosure, or provide substantiation.`
    );
  }
  if (redlineNotes.length === 0) {
    redlineNotes.push("No redline needed — copy passes the automated checks.");
  }

  return {
    mock: true,
    overallStatus,
    riskWarningCheck: {
      pass: riskWarningPass,
      explanation: riskWarningPass
        ? `Found risk warning language ("${riskWarningMatches[0]}").`
        : "No recognizable FCA risk warning phrase found in the copy.",
    },
    bannedIncentiveCheck: {
      pass: bannedIncentivePass,
      explanation: bannedIncentivePass
        ? "No banned incentive phrases detected."
        : `Detected potentially banned incentive language: ${bannedIncentiveMatches.join(", ")}.`,
    },
    flaggedClaims,
    recommendedRedline: redlineNotes.join(" "),
  };
}

// Stubbed asset-listing disclosure checklist, following the structure of
// ../../prompts/asset-listing-disclosure-checklist.md. Same rule-based-mock
// contract as runFinancialPromotionsReview above: keyword/heuristic checks
// only, no real synthesis. The factsheet field is honest about this — it
// does NOT fake a genuine plain-English rewrite, since that needs a real
// model call, not string matching.

const SECURITY_KEYWORDS = [
  "equity",
  "dividend",
  "profit share",
  "profit-sharing",
  "revenue share",
  "voting rights",
  "ownership stake",
];

const PAYMENT_KEYWORDS = [
  "means of payment",
  "medium of exchange",
  "transaction fee",
  "gas fee",
  "payment rail",
  "settlement",
];

const UTILITY_KEYWORDS = ["access to", "governance", "utility token", "network fee", "staking reward", "platform feature"];

const AUDIT_KEYWORDS = ["audit", "audited"];
const CONCENTRATION_KEYWORDS = ["team holds", "founder allocation", "treasury holds", "top holders", "whale"];
const LIQUIDITY_KEYWORDS = ["liquidity", "trading volume", "market maker"];

const DEPENDENCY_KEYWORDS = [
  "travel rule",
  "network upgrade",
  "hard fork",
  "mainnet migration",
  "bridge",
  "oracle",
  "staking",
  "validator",
];

function countMatches(text, phrases) {
  const lower = text.toLowerCase();
  return phrases.filter((p) => lower.includes(p)).length;
}

export function runAssetListingReview(assetText) {
  const text = assetText ?? "";

  const scores = {
    "Security-like": countMatches(text, SECURITY_KEYWORDS),
    "Payment-like": countMatches(text, PAYMENT_KEYWORDS),
    "Utility-like": countMatches(text, UTILITY_KEYWORDS),
  };
  const topScore = Math.max(...Object.values(scores));
  const topCategories = Object.entries(scores)
    .filter(([, score]) => score === topScore)
    .map(([category]) => category);

  let classification;
  let classificationRationale;
  if (topScore === 0) {
    classification = "Unclear from provided text";
    classificationRationale =
      "No security/payment/utility indicator keywords detected — requires legal classification review before listing.";
  } else if (topCategories.length > 1) {
    classification = "Mixed / unclear";
    classificationRationale = `Indicator keywords matched multiple categories equally (${topCategories.join(
      ", "
    )}) — requires legal classification review before listing.`;
  } else {
    classification = topCategories[0];
    classificationRationale = `Indicative only, based on keyword matches — requires legal confirmation before listing.`;
  }

  const topRisks = [];
  if (countMatches(text, AUDIT_KEYWORDS) === 0) {
    topRisks.push("No mention of a completed smart contract audit — verify audit status and auditor reputation before listing.");
  } else {
    topRisks.push("Audit mentioned in provided text — confirm audit scope, findings, and remediation status before listing.");
  }
  if (countMatches(text, CONCENTRATION_KEYWORDS) > 0) {
    topRisks.push("Token holder concentration language detected — request full top-holder distribution data.");
  } else {
    topRisks.push("Token holder concentration not disclosed in provided text — request top-holder distribution data.");
  }
  if (countMatches(text, LIQUIDITY_KEYWORDS) === 0) {
    topRisks.push("No liquidity/market-maker information provided — assess exchange listing depth separately.");
  } else {
    topRisks.push("Liquidity referenced in provided text — verify depth and market-maker arrangements independently.");
  }

  const dependencyMatches = [...new Set(DEPENDENCY_KEYWORDS.filter((k) => text.toLowerCase().includes(k)))];
  const flaggedDependencies =
    dependencyMatches.length > 0
      ? dependencyMatches
      : ["None detected by automated scan — confirm operational dependencies manually with the project team."];

  const trimmed = text.trim();
  const factsheetSummary =
    trimmed.length > 0
      ? `[Mock draft — not a genuine plain-English rewrite, paraphrase manually before use] ${trimmed.slice(0, 300)}${
          trimmed.length > 300 ? "…" : ""
        }`
      : "No asset details provided to summarize.";

  return {
    mock: true,
    classification,
    classificationRationale,
    topRisks,
    factsheetSummary,
    flaggedDependencies,
  };
}
