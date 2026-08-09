import { useEffect, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { api } from "../api";
import type { CycleTimeMetrics } from "../types";

export function formatHours(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export function CycleTimePanel() {
  const [slaHours, setSlaHours] = useState(48);
  const [metrics, setMetrics] = useState<CycleTimeMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getCycleTime(slaHours)
      .then(setMetrics)
      .catch((e) => setError((e as Error).message));
  }, [slaHours]);

  return (
    <div className="chart-card chart-card-wide">
      <div className="panel-header">
        <div>
          <h3>Cycle Time &amp; Bottlenecks</h3>
          <p className="muted">
            Average time each approver role takes to act, and cases currently sitting past SLA.
          </p>
        </div>
        <label className="sla-input">
          SLA threshold
          <input
            type="number"
            min={1}
            max={720}
            value={slaHours}
            onChange={(e) => setSlaHours(Math.max(1, Number(e.target.value) || 1))}
          />
          hours
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      {!metrics ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="briefing-metrics">
            <div>
              <span className="briefing-metric-value">
                {metrics.overall.resolvedCount > 0 ? formatHours(metrics.overall.avgResolutionHours) : "—"}
              </span>
              <span className="muted">Avg time to resolution</span>
            </div>
            <div>
              <span className="briefing-metric-value">
                {metrics.overall.resolvedCount > 0 ? formatHours(metrics.overall.medianResolutionHours) : "—"}
              </span>
              <span className="muted">Median time to resolution</span>
            </div>
            <div>
              <span className="briefing-metric-value">{metrics.overall.resolvedCount}</span>
              <span className="muted">Resolved cases measured</span>
            </div>
            <div>
              <span className="briefing-metric-value">{metrics.breaches.length}</span>
              <span className="muted">Currently over SLA</span>
            </div>
          </div>

          {metrics.byRole.length > 0 ? (
            <>
              <p className="muted">Average hours per role from case-open to hand-off, by completed transitions.</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={metrics.byRole} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="role"
                    tick={{ fontSize: 11, fill: "var(--text)" }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "var(--text)" }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip
                    formatter={(value: any) => [`${value}h avg`, "Avg time in stage"]}
                    contentStyle={{
                      background: "var(--panel-bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12.5,
                    }}
                  />
                  <Bar dataKey="avgHours" radius={[4, 4, 0, 0]}>
                    {metrics.byRole.map((r) => (
                      <Cell
                        key={r.role}
                        fill={r.avgHours >= metrics.slaHours ? "var(--status-critical)" : "var(--series-1)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : (
            <p className="muted">No completed stage transitions yet — approve, reject, or return a case to see this.</p>
          )}

          {metrics.breaches.length > 0 && (
            <div className="sla-breach-block">
              <h4>
                Cases past SLA ({metrics.slaHours}h) <span aria-hidden="true">⚠</span>
              </h4>
              <table className="instance-table">
                <thead>
                  <tr>
                    <th>Case #</th>
                    <th>Subject</th>
                    <th>Stage</th>
                    <th>Waiting on</th>
                    <th>Time in stage</th>
                    <th>Submitted by</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.breaches.map((b) => (
                    <tr key={b.case_number}>
                      <td className="case-number-cell">{b.case_number}</td>
                      <td>{b.title}</td>
                      <td>{b.stage_name}</td>
                      <td>
                        <span className="chip">{b.approver_role}</span>
                      </td>
                      <td>{formatHours(b.hours_in_stage)}</td>
                      <td>{b.submitted_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
