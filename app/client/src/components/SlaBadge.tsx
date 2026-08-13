import type { SlaStatus } from "../types";

const LABELS: Record<SlaStatus, string> = {
  on_track: "ON TRACK",
  at_risk: "AT RISK",
  breached: "SLA BREACHED",
};

export function SlaBadge({ status, hoursInStage }: { status: SlaStatus | null; hoursInStage: number | null }) {
  if (!status) return null;
  return (
    <span className={`badge badge-sla-${status}`} title={hoursInStage != null ? `${hoursInStage}h in current stage` : undefined}>
      {LABELS[status]}
    </span>
  );
}
