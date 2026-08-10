import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { DeployTarget, IntegrationEvent, Severity, WorkflowTemplate } from "../types";
import { SEVERITY_OPTIONS, getContentLabel, getContentPlaceholder } from "../constants";
import { createSpeechRecognition, isSpeechRecognitionSupported, parseVoiceTranscript, type ParsedVoiceIntake } from "../voiceIntake";

const EVENT_TYPE_LABELS: Record<string, string> = {
  slack_notification: "Slack notification",
  slack_inbound: "Slack inbound",
  deploy_trigger: "Deploy trigger",
  voice_intake: "Voice intake",
};

export function IntegrationsPage() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [events, setEvents] = useState<IntegrationEvent[]>([]);
  const [deployTargets, setDeployTargets] = useState<Record<string, DeployTarget>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const [voiceSupported] = useState(() => isSpeechRecognitionSupported());
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const [voiceTemplateId, setVoiceTemplateId] = useState("");
  const [voiceTitle, setVoiceTitle] = useState("");
  const [voiceContent, setVoiceContent] = useState("");
  const [voiceSeverity, setVoiceSeverity] = useState<Severity | "">("");
  const [voiceParsed, setVoiceParsed] = useState<ParsedVoiceIntake | null>(null);
  const [voiceSubmitting, setVoiceSubmitting] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceResult, setVoiceResult] = useState<string | null>(null);
  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition>>(null);
  const finalTranscriptRef = useRef("");

  const selectedTemplate = templates.find((t) => t.id === templateId);

  async function refresh() {
    try {
      const ev = await api.listIntegrationEvents(50);
      setEvents(ev);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api.listTemplates().then(setTemplates).catch(() => {});
    api.getDeployTargets().then(setDeployTargets).catch(() => {});
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  async function handleSlackSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTemplate) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.simulateSlackNewCase({
        template_id: templateId,
        title,
        content,
        severity: severity || undefined,
      });
      setLastResult(`Case ${created.case_number} created from the simulated Slack submission.`);
      setTemplateId("");
      setTitle("");
      setContent("");
      setSeverity("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function startRecording() {
    const recognition = createSpeechRecognition();
    if (!recognition) return;
    finalTranscriptRef.current = "";
    setTranscript("");
    setMicError(null);
    setVoiceResult(null);

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscriptRef.current += `${result[0].transcript} `;
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript((finalTranscriptRef.current + interim).trim());
    };
    recognition.onerror = (event) => {
      setMicError(
        event.error === "not-allowed"
          ? "Microphone access denied — allow mic access in your browser to use voice intake."
          : `Speech recognition error: ${event.error}`
      );
      setRecording(false);
    };
    recognition.onend = () => {
      setRecording(false);
      const finalText = finalTranscriptRef.current.trim();
      if (finalText) {
        const parsed = parseVoiceTranscript(finalText, templates);
        setVoiceTemplateId(parsed.templateId ?? "");
        setVoiceTitle(parsed.title);
        setVoiceContent(finalText);
        setVoiceSeverity(parsed.severity ?? "");
        setVoiceParsed(parsed);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  }

  function stopRecording() {
    recognitionRef.current?.stop();
  }

  async function handleVoiceSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!voiceTemplateId) return;
    setVoiceSubmitting(true);
    setVoiceError(null);
    try {
      const created = await api.voiceNewCase({
        template_id: voiceTemplateId,
        title: voiceTitle,
        content: voiceContent,
        severity: voiceSeverity || undefined,
        transcript,
        auto_detected: voiceParsed ?? undefined,
      });
      setVoiceResult(`Case ${created.case_number} created from your voice note.`);
      setVoiceTemplateId("");
      setVoiceTitle("");
      setVoiceContent("");
      setVoiceSeverity("");
      setTranscript("");
      finalTranscriptRef.current = "";
      setVoiceParsed(null);
      await refresh();
    } catch (err) {
      setVoiceError((err as Error).message);
    } finally {
      setVoiceSubmitting(false);
    }
  }

  return (
    <div className="page">
      <section className="panel">
        <h2>Integrations</h2>
        <p className="muted">
          No live Slack app or CI/CD credentials are connected here — the Slack and deploy-trigger sections below
          simulate the exact contract those integrations would use, so the design is demonstrable without wiring up
          real external systems. Voice intake is the exception: it's real, running entirely in your browser with no
          external service or API key.
        </p>
      </section>

      <section className="panel slack-intake-panel">
        <div className="slack-intake-header">
          <span className="slack-intake-icon">#</span>
          <div>
            <div className="slack-intake-title">regops-intake</div>
            <div className="muted">Simulated Slack slash command · /regops new-case</div>
          </div>
        </div>

        {lastResult && <div className="case-created-banner">{lastResult}</div>}

        <form onSubmit={handleSlackSubmit} className="form">
          <label>
            Process type
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
              <option value="" disabled>
                Select process type…
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Case subject
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="What you'd type after /regops new-case"
            />
          </label>
          {selectedTemplate && (
            <label>
              {getContentLabel(selectedTemplate.name)}
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={3}
                placeholder={getContentPlaceholder(selectedTemplate.name)}
                required
              />
            </label>
          )}
          <label>
            Urgency
            <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} required>
              <option value="" disabled>
                Select urgency…
              </option>
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn-primary" disabled={submitting || !selectedTemplate}>
            {submitting ? "Sending…" : "Send via Slack (simulated)"}
          </button>
        </form>
      </section>

      <section className="panel voice-intake-panel">
        <div className="voice-intake-header">
          <span className="voice-intake-icon">🎙</span>
          <div>
            <div className="voice-intake-title">
              Voice note intake <span className="badge badge-live">Live</span>
            </div>
            <div className="muted">Real transcription via your browser's Web Speech API — no external service or API key.</div>
          </div>
        </div>

        {!voiceSupported ? (
          <p className="muted">
            Voice intake needs a browser with Web Speech API support (Chrome, or Chrome on Android) — not available
            in this browser.
          </p>
        ) : (
          <>
            <div className="voice-record-row">
              {!recording ? (
                <button type="button" className="btn-primary btn-record" onClick={startRecording}>
                  ● Record voice note
                </button>
              ) : (
                <button type="button" className="btn-secondary" onClick={stopRecording}>
                  ■ Stop recording
                </button>
              )}
              {recording && (
                <span className="recording-indicator">
                  <span className="recording-dot" /> Listening…
                </span>
              )}
            </div>

            {micError && <p className="error">{micError}</p>}
            {voiceResult && <div className="case-created-banner">{voiceResult}</div>}

            {transcript && (
              <>
                <p className="muted">Transcript</p>
                <div className="voice-transcript-box">{transcript}</div>
              </>
            )}

            {voiceContent && !recording && (
              <form onSubmit={handleVoiceSubmit} className="form">
                <p className="muted">Auto-detected from your transcript — review and correct before submitting.</p>
                <label>
                  Process type
                  <select value={voiceTemplateId} onChange={(e) => setVoiceTemplateId(e.target.value)} required>
                    <option value="" disabled>
                      Select process type…
                    </option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Case subject
                  <input value={voiceTitle} onChange={(e) => setVoiceTitle(e.target.value)} required />
                </label>
                <label>
                  Transcript / details
                  <textarea value={voiceContent} onChange={(e) => setVoiceContent(e.target.value)} rows={4} required />
                </label>
                <label>
                  Urgency
                  <select value={voiceSeverity} onChange={(e) => setVoiceSeverity(e.target.value as Severity)} required>
                    <option value="" disabled>
                      Select urgency…
                    </option>
                    {SEVERITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                {voiceError && <p className="error">{voiceError}</p>}
                <button type="submit" className="btn-primary" disabled={voiceSubmitting}>
                  {voiceSubmitting ? "Creating…" : "Create Case from Voice Note"}
                </button>
              </form>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <h2>What a final approval triggers</h2>
        <p className="muted">
          "Push to production" means something different per process — publishing marketing copy isn't the same
          operation as listing an asset or shipping a code change. Each process type maps to a distinct downstream
          system, and the trigger fires automatically the moment a case reaches final approval.
        </p>
        <table className="instance-table">
          <thead>
            <tr>
              <th>Process type</th>
              <th>Target system</th>
              <th>Simulated action</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(deployTargets).map(([templateName, target]) => (
              <tr key={templateName}>
                <td>{templateName}</td>
                <td>{target.system}</td>
                <td>
                  <code>{target.action}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Integration Activity</h2>
          <button className="btn-secondary" onClick={refresh} type="button">
            Refresh
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {loading ? (
          <p>Loading…</p>
        ) : events.length === 0 ? (
          <p className="muted">No integration events yet — submit a case or take a final decision to see one logged here.</p>
        ) : (
          <ul className="integration-feed">
            {events.map((ev) => (
              <li key={ev.id} className="integration-event">
                <div className="integration-event-header">
                  <span className={`badge badge-direction-${ev.direction}`}>{ev.direction}</span>
                  <span className={`badge badge-event-${ev.event_type}`}>
                    {EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type}
                  </span>
                  <span className="integration-event-target">{ev.target}</span>
                  {ev.case_number && <span className="muted">{ev.case_number}</span>}
                  <span className="muted timestamp">{new Date(ev.created_at).toLocaleString()}</span>
                </div>
                <p>{ev.summary}</p>
                <details>
                  <summary>{ev.event_type === "voice_intake" ? "View transcript payload" : "View simulated payload"}</summary>
                  <pre className="integration-payload">{JSON.stringify(ev.payload, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
