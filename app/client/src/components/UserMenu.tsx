import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  return (
    <div className="user-menu" ref={ref}>
      <button className="user-avatar" onClick={() => setOpen((o) => !o)} aria-label="Account menu">
        {initials(user.name)}
      </button>
      {open && (
        <div className="user-menu-dropdown">
          <div className="user-menu-name">{user.name}</div>
          <div className="muted user-menu-email">{user.email}</div>
          {user.approver_role && <span className="chip user-menu-role">{user.approver_role} approver</span>}
          <button className="btn-secondary user-menu-signout" onClick={logout}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
