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

// FCA Consumer Duty (PS22/9) checks, kept deliberately separate from the
// PS23/6 financial-promotions checks above — Consumer Duty is a broader,
// outcomes-based framework and the prep-guide interview explicitly asks how
// it interacts with financial promotions. Same rule-based-mock honesty
// contract as the rest of this file: keyword heuristics only, indicative,
// not a substitute for a real Consumer Duty assessment.
const TARGET_MARKET_PHRASES = [
  "professional investor",
  "professional investors",
  "experienced investor",
  "experienced investors",
  "may not be suitable",
  "not suitable for",
  "consider your circumstances",
  "if you are unsure",
  "target market",
];

const COST_DISCLOSURE_PHRASES = ["fee", "fees", "charge", "charges", "cost", "costs", "commission"];

const MONETARY_BENEFIT_PHRASES = [
  "apy",
  "yield",
  "reward",
  "rewards",
  "return",
  "returns",
  "bonus",
  "interest rate",
  "earn up to",
];

const JARGON_PHRASES = ["apy", "staking", "smart contract", "defi", "liquidity pool", "gas fee", "yield farming", "on-chain"];

const PLAIN_LANGUAGE_MARKERS = ["in simple terms", "in plain terms", "this means", "put simply", "to put it simply"];

function findMatches(text, phrases) {
  const lower = text.toLowerCase();
  return phrases.filter((p) => lower.includes(p));
}

function checkConsumerDuty(text) {
  const lower = text.toLowerCase();

  const hasTargetMarket = TARGET_MARKET_PHRASES.some((p) => lower.includes(p));
  const productsAndServices = {
    pass: hasTargetMarket,
    explanation: hasTargetMarket
      ? "Copy identifies a target market or suitability context."
      : "No target-market or suitability framing detected — the Products & Services outcome expects a promotion to be understandable in the context of its intended audience.",
  };

  const mentionsBenefit = MONETARY_BENEFIT_PHRASES.some((p) => lower.includes(p));
  const mentionsCost = COST_DISCLOSURE_PHRASES.some((p) => lower.includes(p));
  const priceAndValue = {
    pass: !mentionsBenefit || mentionsCost,
    explanation: !mentionsBenefit
      ? "No monetary benefit claims detected that would require a cost disclosure."
      : mentionsCost
        ? "Monetary benefit claims are paired with cost/fee disclosure language."
        : "Monetary benefit claims (e.g. returns, rewards, APY) aren't paired with any visible cost or fee disclosure — the Price & Value outcome requires customers to be able to judge fair value.",
  };

  const jargonMatches = JARGON_PHRASES.filter((p) => lower.includes(p));
  const hasPlainLanguageMarker = PLAIN_LANGUAGE_MARKERS.some((p) => lower.includes(p));
  const consumerUnderstanding = {
    pass: jargonMatches.length === 0 || hasPlainLanguageMarker,
    explanation:
      jargonMatches.length === 0
        ? "No unexplained technical jargon detected."
        : hasPlainLanguageMarker
          ? `Technical terms detected (${jargonMatches.join(", ")}) but the copy includes plain-language framing.`
          : `Technical terms detected (${jargonMatches.join(", ")}) with no plain-language explanation — the Consumer Understanding outcome requires communications a retail customer can actually follow.`,
  };

  const consumerSupport = {
    pass: null,
    explanation:
      "Not assessable from promotion text alone — the Consumer Support outcome is evaluated at the process level (e.g. post-sale support pathways), not per-promotion.",
  };

  return { productsAndServices, priceAndValue, consumerUnderstanding, consumerSupport };
}

export function runFinancialPromotionsReview(copyText) {
  const text = copyText ?? "";

  const riskWarningMatches = findMatches(text, RISK_WARNING_PHRASES);
  const riskWarningPass = riskWarningMatches.length > 0;

  const bannedIncentiveMatches = findMatches(text, BANNED_INCENTIVE_PHRASES);
  const bannedIncentivePass = bannedIncentiveMatches.length === 0;

  const flaggedClaims = findMatches(text, UNSUBSTANTIATED_CLAIM_PHRASES);
  const consumerDutyCheck = checkConsumerDuty(text);
  // Consumer Support is always null/N/A (not assessable per-promotion, see
  // checkConsumerDuty) — only the three assessable outcomes count toward
  // overall status.
  const consumerDutyFails = [
    consumerDutyCheck.productsAndServices,
    consumerDutyCheck.priceAndValue,
    consumerDutyCheck.consumerUnderstanding,
  ].some((outcome) => !outcome.pass);

  let overallStatus;
  if (!bannedIncentivePass) {
    overallStatus = "REJECT";
  } else if (!riskWarningPass || flaggedClaims.length > 0 || consumerDutyFails) {
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
  if (!consumerDutyCheck.productsAndServices.pass) {
    redlineNotes.push("Add a target-market or suitability statement to satisfy the Consumer Duty Products & Services outcome.");
  }
  if (!consumerDutyCheck.priceAndValue.pass) {
    redlineNotes.push("Pair any yield/reward/bonus claim with visible cost or fee disclosure to satisfy the Consumer Duty Price & Value outcome.");
  }
  if (!consumerDutyCheck.consumerUnderstanding.pass) {
    redlineNotes.push("Plain-language any technical terms to satisfy the Consumer Duty Consumer Understanding outcome.");
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
    consumerDutyCheck,
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
