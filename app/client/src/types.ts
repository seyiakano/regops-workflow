export interface Stage {
  name: string;
  approverRole: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  stages: Stage[];
  created_at: string;
}

export type InstanceStatus = "in_progress" | "approved" | "rejected" | "returned_to_submitter";
export type Severity = "severe" | "high" | "low";

export interface User {
  id: string;
  name: string;
  email: string;
  approver_role: string | null;
  is_admin: boolean;
}

export interface LoginResult {
  token: string;
  user: User;
}

export interface Attachment {
  id: string;
  instance_id: string;
  original_name: string;
  stored_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
  url: string;
}

export interface WorkflowInstance {
  id: string;
  case_number: string;
  template_id: string;
  template_name: string;
  title: string;
  submitted_by: string;
  content: string | null;
  figma_link: string | null;
  severity: Severity | null;
  current_stage_index: number;
  status: InstanceStatus;
  stages: Stage[];
  current_stage: Stage | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  instance_id: string;
  stage_name: string | null;
  actor: string;
  action: "submit" | "approve" | "reject" | "return" | "ai_review";
  comment: string;
  created_at: string;
}

export interface FinancialPromotionReviewOutput {
  mock: boolean;
  overallStatus: "PASS" | "REJECT" | "REVISION REQUIRED";
  riskWarningCheck: { pass: boolean; explanation: string };
  bannedIncentiveCheck: { pass: boolean; explanation: string };
  flaggedClaims: string[];
  recommendedRedline: string;
}

export interface AssetListingReviewOutput {
  mock: boolean;
  classification: string;
  classificationRationale: string;
  topRisks: string[];
  factsheetSummary: string;
  flaggedDependencies: string[];
}

export type AiReview =
  | {
      id: string;
      instance_id: string;
      stage_name: string;
      review_type: "financial_promotions";
      is_mock: boolean;
      output: FinancialPromotionReviewOutput;
      created_at: string;
    }
  | {
      id: string;
      instance_id: string;
      stage_name: string;
      review_type: "asset_listing";
      is_mock: boolean;
      output: AssetListingReviewOutput;
      created_at: string;
    };

export interface WorkflowInstanceDetail extends WorkflowInstance {
  audit_log: AuditLogEntry[];
  ai_reviews: AiReview[];
  attachments: Attachment[];
}

export interface CaseStats {
  period: string;
  total: number;
  byStatus: { pending: number; approved: number; rejected: number; returned: number };
  byType: { name: string; count: number }[];
}

export interface InstanceListResult {
  items: WorkflowInstance[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditRow {
  id: string;
  case_number: string;
  case_title: string;
  template_name: string;
  created_at: string;
  actor: string;
  action: string;
  stage_name: string | null;
  comment: string;
}

export interface AuditSummary {
  total: number;
  submit: number;
  approve: number;
  reject: number;
  return: number;
  ai_review: number;
}

export interface AuditResult {
  rows: AuditRow[];
  summary: AuditSummary;
}

export interface TrendPoint {
  date: string;
  submitted: number;
  approved: number;
}

export interface TrendResult {
  days: number;
  series: TrendPoint[];
}

export interface CycleTimeRoleStat {
  role: string;
  count: number;
  avgHours: number;
  medianHours: number;
  maxHours: number;
}

export interface CycleTimeBreach {
  case_number: string;
  title: string;
  stage_name: string;
  approver_role: string;
  hours_in_stage: number;
  submitted_by: string;
}

export interface CycleTimeMetrics {
  slaHours: number;
  byRole: CycleTimeRoleStat[];
  overall: { resolvedCount: number; avgResolutionHours: number; medianResolutionHours: number };
  breaches: CycleTimeBreach[];
}

export type LaunchGateStatus = "pending" | "approved" | "blocked";
export type LaunchItemStatus = "in_progress" | "ready" | "blocked";

export interface LaunchGate {
  id: string;
  launch_item_id: string;
  gate_name: string;
  approver_role: string;
  status: LaunchGateStatus;
  actor: string | null;
  comment: string | null;
  decided_at: string | null;
}

export interface LaunchItem {
  id: string;
  product_name: string;
  description: string | null;
  target_launch_date: string;
  submitted_by: string;
  status: LaunchItemStatus;
  created_at: string;
  updated_at: string;
  gates: LaunchGate[];
  gates_total: number;
  gates_approved: number;
  days_until_launch: number;
}

export interface ExecutiveBriefing {
  generatedAt: string;
  executiveSummary: string[];
  financialPromotions: {
    total: number;
    approved: number;
    rejected: number;
    returned: number;
    escalatedTo2LoD: number;
    topRejectionReasons: string[];
  };
  assetListings: { caseNumber: string; title: string; stage: string }[];
  regulatoryRisks: string;
  actionItems: string[];
  notesProvided: boolean;
}
