import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { api } from "../api";
import type { CaseStats, WorkflowInstance, WorkflowTemplate, TrendPoint } from "../types";
import { StatusBadge } from "./StatusBadge";
import { CycleTimePanel } from "./CycleTimePanel";

// Fixed categorical order (never cycled/reassigned) — dataviz skill reference palette.
const SERIES_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];

type Drilldown = { label: string; templateId?: string; status?: string };

const STATUS_META: Record<string, { label: string; color: string; matches: (s: string) => boolean }> = {
  pending: { label: "Pending", color: "var(--status-warning)", matches: (s) => s === "in_progress" },
  approved: { label: "Approved", color: "var(--status-good)", matches: (s) => s === "approved" },
  rejected: { label: "Rejected", color: "var(--status-critical)", matches: (s) => s === "rejected" },
  returned: { label: "Returned", color: "var(--status-serious)", matches: (s) => s === "returned_to_submitter" },
};

export function ExecutiveDashboard() {
  const [stats, setStats] = useState<CaseStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);
  const [drilldownRows, setDrilldownRows] = useState<WorkflowInstance[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getStats("all"), api.getTrend(30), api.listTemplates()])
      .then(([s, t, tmpl]) => {
        setStats(s);
        setTrend(t.series);
        setTemplates(tmpl);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    if (!drilldown) return;
    setDrilldownLoading(true);
    api
      .listInstances({ template_id: drilldown.templateId, status: drilldown.status, limit: 25 })
      .then((r) => setDrilldownRows(r.items))
      .catch((e) => setError((e as Error).message))
      .finally(() => setDrilldownLoading(false));
  }, [drilldown]);

  if (error) return <p className="error">{error}</p>;
  if (!stats) return <p>Loading…</p>;

  const byType = stats.byType.map((t, i) => ({
    ...t,
    fill: SERIES_COLORS[i % SERIES_COLORS.length],
    templateId: templates.find((tmpl) => tmpl.name === t.name)?.id,
  }));

  const statusData = Object.entries(STATUS_META).map(([key, meta]) => ({
    key,
    name: meta.label,
    value: stats.byStatus[key as keyof CaseStats["byStatus"]],
    fill: meta.color,
  }));

  return (
    <div className="exec-dashboard">
      <div className="chart-grid">
        <div className="chart-card">
          <h3>Cases by Process Type</h3>
          <p className="muted">Click a bar to see the underlying cases.</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byType} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "var(--text)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
                interval={0}
                angle={-15}
                textAnchor="end"
                height={50}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "var(--text)" }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                cursor={{ fill: "var(--accent-bg)" }}
                contentStyle={{
                  background: "var(--panel-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12.5,
                }}
              />
              <Bar
                dataKey="count"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(d: any) =>
                  setDrilldown({ label: `${d.name} cases`, templateId: d.templateId })
                }
              >
                {byType.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Status Breakdown</h3>
          <p className="muted">Click a slice to see the underlying cases.</p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Tooltip
                contentStyle={{
                  background: "var(--panel-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12.5,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                cursor="pointer"
                onClick={(d: any) =>
                  setDrilldown({
                    label: `${d.name} cases`,
                    status:
                      d.key === "pending"
                        ? "in_progress"
                        : d.key === "returned"
                          ? "returned_to_submitter"
                          : d.key,
                  })
                }
              >
                {statusData.map((entry) => (
                  <Cell key={entry.key} fill={entry.fill} stroke="var(--panel-bg)" strokeWidth={2} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card chart-card-wide">
          <h3>Submission &amp; Approval Trend (last 30 days)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "var(--text)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
                minTickGap={24}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "var(--text)" }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--panel-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12.5,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="submitted"
                name="Submitted"
                stroke="var(--series-1)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="approved"
                name="Approved"
                stroke="var(--series-6)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <CycleTimePanel />
      </div>

      {drilldown && (
        <div className="drilldown-panel">
          <div className="panel-header">
            <h3>{drilldown.label}</h3>
            <button className="btn-secondary" onClick={() => setDrilldown(null)}>
              Clear
            </button>
          </div>
          {drilldownLoading ? (
            <p>Loading…</p>
          ) : drilldownRows.length === 0 ? (
            <p className="muted">No cases found.</p>
          ) : (
            <table className="instance-table">
              <thead>
                <tr>
                  <th>Case #</th>
                  <th>Subject</th>
                  <th>Process Type</th>
                  <th>Status</th>
                  <th>Submitted by</th>
                </tr>
              </thead>
              <tbody>
                {drilldownRows.map((inst) => (
                  <tr key={inst.id}>
                    <td className="case-number-cell">{inst.case_number}</td>
                    <td>{inst.title}</td>
                    <td>{inst.template_name}</td>
                    <td>
                      <StatusBadge status={inst.status} />
                    </td>
                    <td>{inst.submitted_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
