// Mirrors server/formatters.js — deterministic Europe/London (GMT/BST)
// formatting computed manually from the EU DST rule rather than via Intl's
// timeZoneName, so it doesn't depend on ICU data varying between browsers.
// Keep both in sync if this logic changes.

function lastSundayUTC(year: number, monthIndex: number): number {
  const lastDayOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0));
  return lastDayOfMonth.getUTCDate() - lastDayOfMonth.getUTCDay();
}

function isBst(date: Date): boolean {
  const year = date.getUTCFullYear();
  const start = new Date(Date.UTC(year, 2, lastSundayUTC(year, 2), 1, 0, 0));
  const end = new Date(Date.UTC(year, 9, lastSundayUTC(year, 9), 1, 0, 0));
  return date >= start && date < end;
}

export function formatUkTimestamp(iso: string): string {
  if (!iso) return "";
  const utcDate = new Date(iso);
  const bst = isBst(utcDate);
  const local = new Date(utcDate.getTime() + (bst ? 3600000 : 0));
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = local.getUTCFullYear();
  const mo = pad(local.getUTCMonth() + 1);
  const d = pad(local.getUTCDate());
  const h = pad(local.getUTCHours());
  const mi = pad(local.getUTCMinutes());
  return `${y}-${mo}-${d} ${h}:${mi} ${bst ? "BST" : "GMT"}`;
}
