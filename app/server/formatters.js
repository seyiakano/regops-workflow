// Deterministic Europe/London (GMT/BST) formatting — computed manually from
// the EU DST rule (clocks forward last Sunday of March 01:00 UTC, back last
// Sunday of October 01:00 UTC, which is exactly the rule Europe/London
// follows) rather than via Intl's timeZoneName, so this doesn't depend on
// the ICU data bundled with whatever Node version happens to be running.
// Mirrored in client/src/formatters.ts for on-screen display — keep both in
// sync if this logic changes.

function lastSundayUTC(year, monthIndex) {
  const lastDayOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0));
  return lastDayOfMonth.getUTCDate() - lastDayOfMonth.getUTCDay();
}

function isBst(date) {
  const year = date.getUTCFullYear();
  const start = new Date(Date.UTC(year, 2, lastSundayUTC(year, 2), 1, 0, 0));
  const end = new Date(Date.UTC(year, 9, lastSundayUTC(year, 9), 1, 0, 0));
  return date >= start && date < end;
}

export function formatUkTimestamp(iso) {
  if (!iso) return "";
  const utcDate = new Date(iso);
  const bst = isBst(utcDate);
  const local = new Date(utcDate.getTime() + (bst ? 3600000 : 0));
  const pad = (n) => String(n).padStart(2, "0");
  const y = local.getUTCFullYear();
  const mo = pad(local.getUTCMonth() + 1);
  const d = pad(local.getUTCDate());
  const h = pad(local.getUTCHours());
  const mi = pad(local.getUTCMinutes());
  return `${y}-${mo}-${d} ${h}:${mi} ${bst ? "BST" : "GMT"}`;
}
