import { db } from "./db.js";

// Following the structure of ../../prompts/executive-briefing-generator.md.
// Metrics/lists below are REAL — computed directly from workflow data, not a
// model call. Only executiveSummary/actionItems (templated phrasing over
// those real numbers) and regulatoryRisks (echoes back whatever notes were
// pasted in, no synthesis) are the "mock" parts — there's no fake analysis
// hiding in here, just plain aggregation dressed as prose.

const FINANCIAL_PROMOTIONS_TEMPLATE = "Financial Promotion Review";
const ASSET_LISTING_TEMPLATE = "Asset Listing Governance Review";

function getTemplateByName(name) {
  return db.prepare("SELECT * FROM workflow_templates WHERE name = ?").get(name);
}

function getCasesForTemplate(templateId) {
  return db.prepare("SELECT rowid, * FROM instances WHERE template_id = ?").all(templateId);
}

export function generateExecutiveBriefing(notes) {
  const fpTemplate = getTemplateByName(FINANCIAL_PROMOTIONS_TEMPLATE);
  const fpCases = fpTemplate ? getCasesForTemplate(fpTemplate.id) : [];

  const fpTotal = fpCases.length;
  const fpApproved = fpCases.filter((c) => c.status === "approved").length;
  const fpRejected = fpCases.filter((c) => c.status === "rejected").length;
  const fpReturned = fpCases.filter((c) => c.status === "returned_to_submitter").length;
  const fpEscalatedTo2LoD = fpCases.filter((c) => c.status === "in_progress" && c.current_stage_index >= 1).length;

  const fpRejectionReasons = fpTemplate
    ? db
        .prepare(
          `SELECT audit_log.comment FROM audit_log
           JOIN instances ON instances.id = audit_log.instance_id
           WHERE instances.template_id = ? AND audit_log.action = 'reject' AND audit_log.comment != ''
           ORDER BY audit_log.created_at DESC LIMIT 5`
        )
        .all(fpTemplate.id)
        .map((r) => r.comment)
    : [];

  const alTemplate = getTemplateByName(ASSET_LISTING_TEMPLATE);
  const alStages = alTemplate ? JSON.parse(alTemplate.stages) : [];
  const assetListingsInProgress = (alTemplate ? getCasesForTemplate(alTemplate.id) : [])
    .filter((c) => c.status === "in_progress")
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .map((c) => ({
      caseNumber: `CASE-${String(c.rowid).padStart(6, "0")}`,
      title: c.title,
      stage: alStages[c.current_stage_index]?.name ?? "Unknown stage",
    }));

  const alTotal = alTemplate ? getCasesForTemplate(alTemplate.id).length : 0;

  const executiveSummary = [
    `${fpTotal + alTotal} case(s) tracked across Financial Promotions and Asset Listing this period (${fpTotal} promotions, ${alTotal} asset listings).`,
    fpEscalatedTo2LoD > 0
      ? `${fpEscalatedTo2LoD} promotion(s) currently escalated to 2LoD Compliance sign-off.`
      : "No promotions currently escalated to 2LoD Compliance.",
    fpRejected > 0
      ? `${fpRejected} promotion(s) rejected this period — see top reasons below.`
      : "No promotions rejected this period.",
  ];

  const actionItems = [];
  if (fpEscalatedTo2LoD > 0) {
    actionItems.push(`Prioritize 2LoD Compliance review for ${fpEscalatedTo2LoD} escalated promotion(s).`);
  }
  if (assetListingsInProgress.length > 0) {
    actionItems.push(`${assetListingsInProgress.length} asset listing(s) awaiting governance sign-off.`);
  }
  if (actionItems.length === 0) {
    actionItems.push("No urgent action items identified from current workflow data.");
  }

  return {
    generatedAt: new Date().toISOString(),
    executiveSummary,
    financialPromotions: {
      total: fpTotal,
      approved: fpApproved,
      rejected: fpRejected,
      returned: fpReturned,
      escalatedTo2LoD: fpEscalatedTo2LoD,
      topRejectionReasons: fpRejectionReasons,
    },
    assetListings: assetListingsInProgress,
    regulatoryRisks: notes && notes.trim() ? notes.trim() : "No additional notes provided for this period.",
    actionItems,
    notesProvided: !!(notes && notes.trim()),
  };
}
