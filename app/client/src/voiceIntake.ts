import type { Severity, WorkflowTemplate } from "./types";

// The Web Speech API's SpeechRecognition isn't in TS's bundled DOM lib (it's
// still a non-standard, vendor-prefixed API in most browsers) — this is a
// deliberately minimal shape covering only what this feature actually uses,
// not a full spec type.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

// en-GB to match the FCA/UK compliance context this app is built around.
export function createSpeechRecognition(): SpeechRecognitionLike | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-GB";
  return recognition;
}

// Keyword heuristics, same "honest rule-based mock" contract as
// server/aiReview.js — this is indicative pattern-matching on the transcript
// text, not a real language model call, and should stay that way unless a
// keyed LLM API is explicitly wired in later.
const TEMPLATE_KEYWORDS: Record<string, string[]> = {
  "Financial Promotion Review": ["financial promotion", "promo", "marketing copy", "advert", "campaign", "promotion"],
  "Asset Listing Governance Review": ["asset listing", "list a token", "listing", "new asset", "new token", "list an asset"],
  "Regulatory Filing": ["regulatory filing", "fca filing", "filing", "regulator", "submission to the fca"],
  "Existing Process Change": ["process change", "existing process", "control change", "update our process", "change to a process"],
  "Language/Compliance Refresher": ["refresher", "training", "attestation", "compliance refresher"],
};

const SEVERITY_KEYWORDS: Record<Severity, string[]> = {
  severe: ["severe", "urgent", "critical", "emergency"],
  high: ["high priority", "important", "high severity"],
  low: ["low priority", "minor", "routine", "low severity"],
};

export interface ParsedVoiceIntake {
  templateId: string | null;
  title: string;
  severity: Severity | null;
}

function guessTitle(transcript: string): string {
  const firstSentence = transcript.split(/[.!?]/)[0]?.trim() ?? "";
  if (!firstSentence) return "Voice-submitted case";
  return firstSentence.length > 80 ? `${firstSentence.slice(0, 80)}…` : firstSentence;
}

export function parseVoiceTranscript(transcript: string, templates: WorkflowTemplate[]): ParsedVoiceIntake {
  const lower = transcript.toLowerCase();

  let templateId: string | null = null;
  for (const template of templates) {
    const keywords = TEMPLATE_KEYWORDS[template.name];
    if (keywords?.some((k) => lower.includes(k))) {
      templateId = template.id;
      break;
    }
  }

  let severity: Severity | null = null;
  for (const [level, keywords] of Object.entries(SEVERITY_KEYWORDS) as [Severity, string[]][]) {
    if (keywords.some((k) => lower.includes(k))) {
      severity = level;
      break;
    }
  }

  return { templateId, title: guessTitle(transcript), severity };
}
