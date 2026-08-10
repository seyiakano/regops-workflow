import type {
  WorkflowTemplate,
  WorkflowInstance,
  WorkflowInstanceDetail,
  Stage,
  AiReview,
  ExecutiveBriefing,
  User,
  LoginResult,
  Attachment,
  CaseStats,
  Severity,
  InstanceListResult,
  AuditResult,
  TrendResult,
  CycleTimeMetrics,
  LaunchItem,
  IntegrationEvent,
  DeployTarget,
} from "./types";
import { getToken, clearToken, broadcastUnauthorized } from "./tokenStore";

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
    ...options,
  });
  if (res.status === 401) {
    clearToken();
    broadcastUnauthorized();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

async function requestMultipart<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(path, { method: "POST", body: formData, headers: authHeaders() });
  if (res.status === 401) {
    clearToken();
    broadcastUnauthorized();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResult>("/api/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<void>("/api/logout", { method: "POST" }),
  me: () => request<User>("/api/me"),

  listTemplates: () => request<WorkflowTemplate[]>("/api/templates"),
  createTemplate: (data: { name: string; description: string; stages: Stage[] }) =>
    request<WorkflowTemplate>("/api/templates", { method: "POST", body: JSON.stringify(data) }),
  deleteTemplate: (id: string) => request<void>(`/api/templates/${id}`, { method: "DELETE" }),

  listInstances: (
    opts: { status?: string; q?: string; template_id?: string; limit?: number; offset?: number } = {}
  ) => {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.q) params.set("q", opts.q);
    if (opts.template_id) params.set("template_id", opts.template_id);
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.offset) params.set("offset", String(opts.offset));
    const qs = params.toString();
    return request<InstanceListResult>(`/api/instances${qs ? `?${qs}` : ""}`);
  },
  getInstance: (id: string) => request<WorkflowInstanceDetail>(`/api/instances/${id}`),
  createInstance: (data: {
    template_id: string;
    title: string;
    content?: string;
    figma_link?: string;
    severity?: Severity;
  }) => request<WorkflowInstance>("/api/instances", { method: "POST", body: JSON.stringify(data) }),
  actionInstance: (id: string, data: { action: string; comment?: string }) =>
    request<WorkflowInstance>(`/api/instances/${id}/action`, { method: "POST", body: JSON.stringify(data) }),
  runAiReview: (id: string) => request<AiReview>(`/api/instances/${id}/ai-review`, { method: "POST" }),
  escalateInstance: (id: string, hoursInStage?: number) =>
    request<{ id: string }>(`/api/instances/${id}/escalate`, {
      method: "POST",
      body: JSON.stringify({ hours_in_stage: hoursInStage }),
    }),
  uploadAttachments: (id: string, files: File[]) => {
    const formData = new FormData();
    for (const f of files) formData.append("files", f);
    return requestMultipart<Attachment[]>(`/api/instances/${id}/attachments`, formData);
  },

  generateExecutiveBriefing: (notes?: string) =>
    request<ExecutiveBriefing>("/api/executive-briefing", { method: "POST", body: JSON.stringify({ notes }) }),

  getStats: (period: string) => request<CaseStats>(`/api/stats?period=${period}`),
  getTrend: (days = 30) => request<TrendResult>(`/api/stats/trend?days=${days}`),
  getCycleTime: (slaHours = 48) => request<CycleTimeMetrics>(`/api/stats/cycle-time?slaHours=${slaHours}`),

  listLaunchItems: () => request<LaunchItem[]>("/api/launch-items"),
  getLaunchItem: (id: string) => request<LaunchItem>(`/api/launch-items/${id}`),
  createLaunchItem: (data: { product_name: string; description?: string; target_launch_date: string }) =>
    request<LaunchItem>("/api/launch-items", { method: "POST", body: JSON.stringify(data) }),
  actionLaunchGate: (launchItemId: string, gateId: string, data: { action: "approved" | "blocked"; comment?: string }) =>
    request<LaunchItem>(`/api/launch-items/${launchItemId}/gates/${gateId}/action`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getNotificationCount: () => request<{ count: number }>("/api/notifications/count"),

  listIntegrationEvents: (limit = 50) => request<IntegrationEvent[]>(`/api/integrations?limit=${limit}`),
  getDeployTargets: () => request<Record<string, DeployTarget>>("/api/integrations/deploy-targets"),
  simulateSlackNewCase: (data: {
    template_id: string;
    title: string;
    content?: string;
    figma_link?: string;
    severity?: Severity;
  }) => request<WorkflowInstance>("/api/integrations/slack/new-case", { method: "POST", body: JSON.stringify(data) }),
  voiceNewCase: (data: {
    template_id: string;
    title: string;
    content?: string;
    severity?: Severity;
    transcript?: string;
    auto_detected?: { templateId: string | null; title: string; severity: Severity | null };
  }) => request<WorkflowInstance>("/api/integrations/voice/new-case", { method: "POST", body: JSON.stringify(data) }),

  getAudit: (filters: { from?: string; to?: string; template_id?: string; action?: string; q?: string; lod?: string }) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    return request<AuditResult>(`/api/audit?${params.toString()}`);
  },
  // A plain <a href> or window.location navigation can't carry the
  // Authorization header, and every /api/* route requires one — so the
  // export has to go through fetch() and trigger a download from the blob
  // response rather than a direct link.
  downloadAuditExport: async (filters: {
    from?: string;
    to?: string;
    template_id?: string;
    action?: string;
    q?: string;
    lod?: string;
  }) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    const res = await fetch(`/api/audit/export?${params.toString()}`, { headers: authHeaders() });
    if (res.status === 401) {
      clearToken();
      broadcastUnauthorized();
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `Request failed: ${res.status}`);
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="(.+)"/);
    const filename = match?.[1] ?? "regops-audit-export.xlsx";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
