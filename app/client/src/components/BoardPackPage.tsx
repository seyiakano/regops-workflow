import { useEffect, useState } from "react";
import { api } from "../api";
import type { AuditSummary, CaseStats, CycleTimeMetrics, ExecutiveBriefing, LaunchItem } from "../types";
import { formatHours } from "./CycleTimePanel";
import { AI_OVERSIGHT_STATEMENT } from "../constants";

const LAUNCH_STATUS_LABEL: Record<string, string> = {
  in_progress: "In progress",
  ready: "Ready to launch",
  blocked: "Blocked",
};

export function BoardPackPage({ onBack }: { onBack: () => void }) {
  const [briefing, setBriefing] = useState<ExecutiveBriefing | null>(null);
  const [stats, setStats] = useState<CaseStats | null>(null);
  const [cycleTime, setCycleTime] = useState<CycleTimeMetrics | null>(null);
  const [launchItems, setLaunchItems] = useState<LaunchItem[]>([]);
  const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.generateExecutiveBriefing(),
      api.getStats("all"),
      api.getCycleTime(48),
      api.listLaunchItems(),
      api.getAudit({}),
    ])
      .then(([b, s, c, l, a]) => {
        setBriefing(b);
        setStats(s);
        setCycleTime(c);
        setLaunchItems(l);
        setAuditSummary(a.summary);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const loading = !briefing || !stats || !cycleTime || !auditSummary;

  return (
    <div className="page">
      <div className="board-pack-toolbar no-print">
        <button className="btn-secondary" onClick={onBack}>
          ← Back to Dashboard
        </button>
        <button className="btn-primary" disabled={loading} onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Preparing board pack…</p>
      ) : (
        <div className="board-pack-doc">
          <header className="board-pack-header">
            <h1>UK Financial Promotions &amp; Asset Listings Governance</h1>
            <p>
              Board / ExCo Reporting Pack — Generated{" "}
              {new Date(briefing.generatedAt).toLocaleString("en-GB", {
                dateStyle: "long",
                timeStyle: "short",
              })}
            </p>
          </header>

          <section className="board-pack-section">
            <h2>Executive Summary</h2>
            <ul>
              {briefing.executiveSummary.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </section>

          <section className="board-pack-section">
            <h2>Financial Promotions Activity</h2>
            <div className="board-pack-metrics">
              <div className="board-pack-metric">
                <span className="board-pack-metric-value">{briefing.financialPromotions.total}</span>
                <span className="board-pack-metric-label">Reviewed</span>
              </div>
              <div className="board-pack-metric">
                <span className="board-pack-metric-value">{briefing.financialPromotions.approved}</span>
                <span className="board-pack-metric-label">Approved</span>
              </div>
              <div className="board-pack-metric">
                <span className="board-pack-metric-value">{briefing.financialPromotions.rejected}</span>
                <span className="board-pack-metric-label">Rejected</span>
              </div>
              <div className="board-pack-metric">
                <span className="board-pack-metric-value">{briefing.financialPromotions.returned}</span>
                <span className="board-pack-metric-label">Returned</span>
              </div>
              <div className="board-pack-metric">
                <span className="board-pack-metric-value">{briefing.financialPromotions.escalatedTo2LoD}</span>
                <span className="board-pack-metric-label">Escalated to 2LoD</span>
              </div>
            </div>
            {briefing.financialPromotions.topRejectionReasons.length > 0 && (
              <>
                <h3>Top reasons for rejection this period</h3>
                <ul>
                  {briefing.financialPromotions.topRejectionReasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="board-pack-section">
            <h2>Asset Listings in Governance Review</h2>
            {briefing.assetListings.length > 0 ? (
              <div className="table-scroll">
                <table className="board-pack-table">
                  <thead>
                    <tr>
                      <th>Case #</th>
                      <th>Title</th>
                      <th>Current stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {briefing.assetListings.map((a) => (
                      <tr key={a.caseNumber}>
                        <td>{a.caseNumber}</td>
                        <td>{a.title}</td>
                        <td>{a.stage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No asset listings currently in governance review.</p>
            )}
          </section>

          <section className="board-pack-section">
            <h2>Operational Performance</h2>
            <div className="board-pack-metrics">
              <div className="board-pack-metric">
                <span className="board-pack-metric-value">{stats.total}</span>
                <span className="board-pack-metric-label">Total cases on record</span>
              </div>
              <div className="board-pack-metric">
                <span className="board-pack-metric-value">
                  {cycleTime.overall.resolvedCount > 0 ? formatHours(cycleTime.overall.avgResolutionHours) : "—"}
                </span>
                <span className="board-pack-metric-label">Avg time to resolution</span>
              </div>
              <div className="board-pack-metric">
                <span className="board-pack-metric-value">
                  {cycleTime.overall.resolvedCount > 0 ? formatHours(cycleTime.overall.medianResolutionHours) : "—"}
                </span>
                <span className="board-pack-metric-label">Median time to resolution</span>
              </div>
              <div className="board-pack-metric">
                <span className="board-pack-metric-value">{cycleTime.breaches.length}</span>
                <span className="board-pack-metric-label">Cases past {cycleTime.slaHours}h SLA</span>
              </div>
            </div>
            {cycleTime.byRole.length > 0 && (
              <>
                <h3>Average hand-off time by approver role</h3>
                <div className="table-scroll">
                  <table className="board-pack-table">
                    <thead>
                      <tr>
                        <th>Role</th>
                        <th>Completed hand-offs</th>
                        <th>Avg time</th>
                        <th>Median time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cycleTime.byRole.map((r) => (
                        <tr key={r.role}>
                          <td>{r.role}</td>
                          <td>{r.count}</td>
                          <td>{formatHours(r.avgHours)}</td>
                          <td>{formatHours(r.medianHours)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className="board-pack-section">
            <h2>Product Governance — Launch Readiness</h2>
            {launchItems.length > 0 ? (
              <div className="table-scroll">
                <table className="board-pack-table">
                  <thead>
                    <tr>
                      <th>Product / feature</th>
                      <th>Target date</th>
                      <th>Status</th>
                      <th>Gates clear</th>
                    </tr>
                  </thead>
                  <tbody>
                    {launchItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.product_name}</td>
                        <td>{new Date(item.target_launch_date).toLocaleDateString("en-GB")}</td>
                        <td>
                          <span className={`board-pack-badge board-pack-badge-${item.status}`}>
                            {LAUNCH_STATUS_LABEL[item.status]}
                          </span>
                        </td>
                        <td>
                          {item.gates_approved}/{item.gates_total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No product launches currently registered.</p>
            )}
          </section>

          <section className="board-pack-section">
            <h2>AI Usage &amp; Human Oversight</h2>
            <p>{AI_OVERSIGHT_STATEMENT}</p>
            <div className="board-pack-metrics">
              <div className="board-pack-metric">
                <span className="board-pack-metric-value">{auditSummary.ai_review}</span>
                <span className="board-pack-metric-label">AI-assisted reviews run (advisory only)</span>
              </div>
              <div className="board-pack-metric">
                {/* Structurally always 0 — no code path lets an AI review action approve/reject/return a case, see AI_OVERSIGHT_STATEMENT */}
                <span className="board-pack-metric-value">0</span>
                <span className="board-pack-metric-label">Cases auto-decided by AI</span>
              </div>
            </div>
          </section>

          <section className="board-pack-section">
            <h2>Regulatory &amp; Operational Risks</h2>
            <p>{briefing.regulatoryRisks}</p>
          </section>

          <section className="board-pack-section">
            <h2>Action Items &amp; Next Steps</h2>
            <ul>
              {briefing.actionItems.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
