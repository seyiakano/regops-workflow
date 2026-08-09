import { db } from "./db.js";

// Daily time series for the executive dashboard's trend line. Two series —
// cases submitted and cases finally approved — both real counts grouped by
// day via SQLite's strftime, not fabricated/interpolated.
export function getDailyTrend(days) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const sinceDate = since.toISOString().slice(0, 10);

  const submitted = db
    .prepare(
      `SELECT strftime('%Y-%m-%d', created_at) as day, COUNT(*) as count
       FROM instances
       WHERE strftime('%Y-%m-%d', created_at) >= ?
       GROUP BY day`
    )
    .all(sinceDate);

  const approved = db
    .prepare(
      `SELECT strftime('%Y-%m-%d', updated_at) as day, COUNT(*) as count
       FROM instances
       WHERE status = 'approved' AND strftime('%Y-%m-%d', updated_at) >= ?
       GROUP BY day`
    )
    .all(sinceDate);

  const submittedByDay = Object.fromEntries(submitted.map((r) => [r.day, r.count]));
  const approvedByDay = Object.fromEntries(approved.map((r) => [r.day, r.count]));

  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    series.push({ date: d, submitted: submittedByDay[d] ?? 0, approved: approvedByDay[d] ?? 0 });
  }
  return series;
}
