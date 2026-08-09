import { useState } from "react";
import { api } from "../api";
import type { ExecutiveBriefing } from "../types";
import { ExecutiveDashboard } from "./ExecutiveDashboard";

export function ExecutiveBriefingPage({ onExportBoardPack }: { onExportBoardPack: () => void }) {
  const [notes, setNotes] = useState("");
  const [briefing, setBriefing] = useState<ExecutiveBriefing | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      setBriefing(await api.generateExecutiveBriefing(notes));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="page">
      <section className="panel">
        <div className="panel-header">
          <h2>Executive Dashboard</h2>
          <button className="btn-primary" onClick={onExportBoardPack}>
            Export Board Pack
          </button>
        </div>
        <p className="muted">
          Live view of everything that's moved through the workflow — click any bar or slice below to drill into the
          underlying cases.
        </p>
        <ExecutiveDashboard />
      </section>

      <section className="panel">
        <h2>Executive Briefing</h2>
        <p className="muted">
          Metrics below are computed live from your workflow data — not AI-generated. The Executive Summary and
          Action Items are template-generated from those numbers, and Regulatory &amp; Operational Risks simply
          echoes back whatever notes you paste in. None of this is a real AI-written narrative yet.
        </p>
        <div className="form">
          <label>
            Additional notes / raw ticket logs (optional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Paste raw weekly notes, ticket summaries, or emerging risks to include under Regulatory & Operational Risks."
            />
          </label>
          <button className="btn-primary" disabled={generating} onClick={generate}>
            {generating ? "Generating…" : "Generate Briefing"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {briefing && (
        <section className="panel briefing-results">
          <p className="muted">Generated {new Date(briefing.generatedAt).toLocaleString()}</p>

          <h3>Executive Summary</h3>
          <ul>
            {briefing.executiveSummary.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>

          <h3>Financial Promotions Metrics</h3>
          <div className="briefing-metrics">
            <div>
              <span className="briefing-metric-value">{briefing.financialPromotions.total}</span>
              <span className="muted">Reviewed</span>
            </div>
            <div>
              <span className="briefing-metric-value">{briefing.financialPromotions.approved}</span>
              <span className="muted">Approved</span>
            </div>
            <div>
              <span className="briefing-metric-value">{briefing.financialPromotions.rejected}</span>
              <span className="muted">Rejected</span>
            </div>
            <div>
              <span className="briefing-metric-value">{briefing.financialPromotions.returned}</span>
              <span className="muted">Returned</span>
            </div>
            <div>
              <span className="briefing-metric-value">{briefing.financialPromotions.escalatedTo2LoD}</span>
              <span className="muted">Escalated to 2LoD</span>
            </div>
          </div>
          <h4>Top reasons for rejection this period</h4>
          {briefing.financialPromotions.topRejectionReasons.length > 0 ? (
            <ul>
              {briefing.financialPromotions.topRejectionReasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">No rejections with comments this period.</p>
          )}

          <h3>Asset Listings Update</h3>
          {briefing.assetListings.length > 0 ? (
            <table className="instance-table">
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
                    <td className="case-number-cell">{a.caseNumber}</td>
                    <td>{a.title}</td>
                    <td>{a.stage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No asset listings currently in governance review.</p>
          )}

          <h3>Regulatory &amp; Operational Risks</h3>
          <p>{briefing.regulatoryRisks}</p>

          <h3>Action Items &amp; Next Steps</h3>
          <ul>
            {briefing.actionItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
