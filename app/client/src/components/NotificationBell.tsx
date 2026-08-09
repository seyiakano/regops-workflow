import { useEffect, useState } from "react";
import { api } from "../api";

const POLL_MS = 60_000;

export function NotificationBell({ onOpenPending }: { onOpenPending: () => void }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const { count } = await api.getNotificationCount();
        if (!cancelled) setCount(count);
      } catch {
        // silent — a failed poll shouldn't disrupt the rest of the app
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <button
      className="notification-bell"
      onClick={onOpenPending}
      aria-label={count > 0 ? `${count} cases awaiting your review` : "No cases awaiting your review"}
      title={count > 0 ? `${count} case(s) awaiting your review` : "No cases awaiting your review"}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {count > 0 && <span className="notification-badge">{count > 9 ? "9+" : count}</span>}
    </button>
  );
}
