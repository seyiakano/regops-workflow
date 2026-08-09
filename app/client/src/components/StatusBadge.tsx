import type { InstanceStatus } from "../types";

const LABELS: Record<InstanceStatus, string> = {
  in_progress: "In progress",
  approved: "Approved",
  rejected: "Rejected",
  returned_to_submitter: "Returned",
};

export function StatusBadge({ status }: { status: InstanceStatus }) {
  return <span className={`badge badge-${status}`}>{LABELS[status]}</span>;
}
