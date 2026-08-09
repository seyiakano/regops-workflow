import { useState } from "react";
import "./App.css";
import { Dashboard } from "./components/Dashboard";
import { TemplatesPage } from "./components/TemplatesPage";
import { InstanceDetail } from "./components/InstanceDetail";
import { ExecutiveBriefingPage } from "./components/ExecutiveBriefingPage";
import { ReviewerBoard } from "./components/ReviewerBoard";
import { AuditTrailPage } from "./components/AuditTrailPage";
import { LoginPage } from "./components/LoginPage";
import { UserMenu } from "./components/UserMenu";
import { NotificationBell } from "./components/NotificationBell";
import { LaunchReadinessBoard } from "./components/LaunchReadinessBoard";
import { LaunchItemDetail } from "./components/LaunchItemDetail";
import { useAuth } from "./auth";

type View =
  | { name: "dashboard" }
  | { name: "reviewer" }
  | { name: "templates" }
  | { name: "instance"; id: string; from: "dashboard" | "reviewer" }
  | { name: "briefing" }
  | { name: "audit" }
  | { name: "governance" }
  | { name: "launch-item"; id: string };

function App() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<View>({ name: "dashboard" });

  if (loading) {
    return (
      <div className="login-shell">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-top">
          <div>
            <h1>RegOps Flow</h1>
            <p className="muted">Programmable, auditable approval workflows</p>
          </div>
          <div className="app-header-actions">
            <NotificationBell onOpenPending={() => setView({ name: "reviewer" })} />
            <UserMenu />
          </div>
        </div>
        <nav className="app-nav">
          <button
            className={view.name === "dashboard" ? "nav-active" : ""}
            onClick={() => setView({ name: "dashboard" })}
          >
            Dashboard
          </button>
          <button
            className={view.name === "reviewer" ? "nav-active" : ""}
            onClick={() => setView({ name: "reviewer" })}
          >
            Reviewer Board
          </button>
          <button
            className={view.name === "governance" || view.name === "launch-item" ? "nav-active" : ""}
            onClick={() => setView({ name: "governance" })}
          >
            Product Governance
          </button>
          {user.is_admin && (
            <button
              className={view.name === "templates" ? "nav-active" : ""}
              onClick={() => setView({ name: "templates" })}
            >
              Workflow Templates
            </button>
          )}
          <button
            className={view.name === "briefing" ? "nav-active" : ""}
            onClick={() => setView({ name: "briefing" })}
          >
            Executive Briefing
          </button>
          <button className={view.name === "audit" ? "nav-active" : ""} onClick={() => setView({ name: "audit" })}>
            Audit Trail
          </button>
        </nav>
      </header>

      <main>
        {view.name === "dashboard" && (
          <Dashboard onOpenInstance={(id) => setView({ name: "instance", id, from: "dashboard" })} />
        )}
        {view.name === "reviewer" && (
          <ReviewerBoard onOpenInstance={(id) => setView({ name: "instance", id, from: "reviewer" })} />
        )}
        {view.name === "governance" && (
          <LaunchReadinessBoard onOpenItem={(id) => setView({ name: "launch-item", id })} />
        )}
        {view.name === "launch-item" && (
          <LaunchItemDetail id={view.id} onBack={() => setView({ name: "governance" })} />
        )}
        {view.name === "templates" && user.is_admin && <TemplatesPage />}
        {view.name === "instance" && (
          <InstanceDetail
            id={view.id}
            onBack={() => setView(view.from === "reviewer" ? { name: "reviewer" } : { name: "dashboard" })}
          />
        )}
        {view.name === "briefing" && <ExecutiveBriefingPage />}
        {view.name === "audit" && <AuditTrailPage />}
      </main>
    </div>
  );
}

export default App;
