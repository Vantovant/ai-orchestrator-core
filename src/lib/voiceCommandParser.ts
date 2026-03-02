// Voice Command Parser — rules-based intent detection + entity extraction

export type VoiceIntent =
  | "create_task"
  | "create_reminder"
  | "create_meeting"
  | "add_expense"
  | "add_income"
  | "run_briefing"
  | "open_page"
  | "unknown";

export interface ParsedVoiceCommand {
  intent: VoiceIntent;
  title?: string;
  description?: string;
  date?: Date;
  amount?: number;
  currency?: string;
  category?: string;
  page?: string;
  location?: string;
  duration?: number; // minutes
  raw: string;
}

const INTENT_PATTERNS: { intent: VoiceIntent; patterns: RegExp[] }[] = [
  {
    intent: "create_task",
    patterns: [
      /^(add|create|new)\s+(a\s+)?task\b/i,
      /^task\b/i,
      /^i\s+need\s+to\b/i,
      /^please\s+add\s+a\s+task\s+to\b/i,
      /^can\s+you\s+create\s+a\s+task\s+to\b/i,
      /^remind\s+me\s+to\s+do\b/i,
      /^i\s+have\s+to\b/i,
      /^i\s+must\b/i,
      /^todo\b/i,
    ],
  },
  {
    intent: "create_reminder",
    patterns: [
      /^(add|create|new|set)\s+(a\s+)?reminder\b/i,
      /^please\s+remind\s+me\s+to\b/i,
      /^don'?t\s+let\s+me\s+forget\s+to\b/i,
      /^reminder\b/i,
    ],
  },
  {
    intent: "create_meeting",
    patterns: [
      /^(add|create|new|schedule|book|set)\s+(a\s+)?meeting\b/i,
      /^meeting\s+with\b/i,
      /^meeting\b/i,
      /^(add|create|new|schedule|book|set)\s+(a\s+)?(zoom|teams|google\s*meet|call|sync|session)\b/i,
      /\bzoom\s+(meeting|call)\b/i,
      /\bteams\s+(meeting|call)\b/i,
      /\bgoogle\s*meet\b/i,
      /\b(zoom\.us|teams\.microsoft|meet\.google)\b/i,
    ],
  },
  {
    intent: "add_expense",
    patterns: [
      /^(add|log|record)\s+(an?\s+)?expense\b/i,
      /^expense\b/i,
      /^i\s+spent\s+R/i,
      /^i\s+paid\s+R/i,
      /^i\s+bought\b/i,
      /^expense:\s*/i,
    ],
  },
  {
    intent: "add_income",
    patterns: [
      /^(add|log|record)\s+(an?\s+)?income\b/i,
      /^income\b/i,
      /^i\s+got\s+paid\s+R/i,
      /^i\s+received\s+R/i,
      /^income:\s*/i,
    ],
  },
  {
    intent: "run_briefing",
    patterns: [
      /^(run|start|give\s+me|show)\s+(my\s+)?(daily\s+)?briefing/i,
      /^briefing$/i,
      /^morning\s+briefing/i,
      /^give\s+me\s+my\s+briefing/i,
      /^run\s+my\s+briefing/i,
      /^what'?s\s+my\s+plan\s+today/i,
      /^what\s+do\s+i\s+have\s+today/i,
    ],
  },
  {
    intent: "open_page",
    patterns: [
      /^(go\s+to|open|show|navigate\s+to)\s+/i,
    ],
  },
];

// ... date/time/amount parsing helpers

function parseDate(text: string): Date | undefined {
  const now = new Date();
  const lower = text.toLowerCase();

  if (/\btoday\b/.test(lower)) {
    return extractTime(now, lower);
  }
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return extractTime(d, lower);
  }

  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (let i = 0; i < dayNames.length; i++) {
    if (lower.includes(dayNames[i])) {
      const d = new Date(now);
      const diff = (i - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return extractTime(d, lower);
    }
  }

  // "on the 25th"
  const dayMatch = lower.match(/(?:on\s+(?:the\s+)?)?(\d{1,2})(?:st|nd|rd|th)/);
  if (dayMatch) {
    const d = new Date(now);
    const day = parseInt(dayMatch[1]);
    if (day >= 1 && day <= 31) {
      d.setDate(day);
      if (d < now) d.setMonth(d.getMonth() + 1);
      return extractTime(d, lower);
    }
  }

  return extractTime(undefined, lower);
}

function extractTime(date: Date | undefined, text: string): Date | undefined {
  const timeMatch = text.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch && date) {
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2] ?? "0");
    const ampm = timeMatch[3]?.toLowerCase();
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
    if (!ampm && hours < 8) hours += 12; // assume PM for small numbers
    date.setHours(hours, minutes, 0, 0);
    return date;
  }
  if (date) {
    date.setHours(9, 0, 0, 0); // default 9am
  }
  return date;
}

function parseAmount(text: string): { amount?: number; currency?: string } {
  const match = text.match(/(?:R\s?|ZAR\s?)(\d[\d,]*(?:\.\d{2})?)|(\d[\d,]*(?:\.\d{2})?)\s*(?:rand|zar)/i);
  if (match) {
    const numStr = (match[1] || match[2]).replace(/,/g, "");
    return { amount: parseFloat(numStr), currency: "ZAR" };
  }
  const plain = text.match(/(\d[\d,]*(?:\.\d{2})?)/);
  if (plain) {
    return { amount: parseFloat(plain[1].replace(/,/g, "")), currency: "ZAR" };
  }
  return {};
}

function extractTitle(text: string, intent: VoiceIntent): string {
  let cleaned = text;
  for (const { intent: i, patterns } of INTENT_PATTERNS) {
    if (i === intent) {
      for (const p of patterns) {
        cleaned = cleaned.replace(p, "").trim();
      }
    }
  }
  cleaned = cleaned
    .replace(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, "")
    .replace(/(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi, "")
    .replace(/(?:on\s+(?:the\s+)?)?\d{1,2}(?:st|nd|rd|th)/gi, "")
    .replace(/(?:R\s?|ZAR\s?)\d[\d,]*(?:\.\d{2})?/gi, "")
    .replace(/\d[\d,]*(?:\.\d{2})?\s*(?:rand|zar)/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[:\s,]+|[:\s,]+$/g, "")
    .trim();
  return cleaned || text.trim();
}

const PAGE_MAP: Record<string, string> = {
  plan: "/plan",
  tasks: "/plan?tab=tasks",
  reminders: "/plan?tab=reminders",
  meetings: "/plan?tab=meetings",
  calendar: "/plan?tab=calendar",
  email: "/email",
  finance: "/finance",
  settings: "/settings",
  dashboard: "/",
  home: "/",
  travel: "/travel",
  shopping: "/shopping",
};

// Meeting keywords for secondary detection
const MEETING_KEYWORDS = /\b(meeting|zoom|teams|google\s*meet|call|sync|session|standup|stand-up|huddle|catch-?up)\b/i;
const MEETING_LINK_PATTERN = /\b(zoom\.us|teams\.microsoft\.com|meet\.google\.com)\b/i;

export function parseVoiceCommand(transcript: string): ParsedVoiceCommand {
  const raw = transcript.trim();
  const lower = raw.toLowerCase();

  let intent: VoiceIntent = "unknown";
  for (const { intent: i, patterns } of INTENT_PATTERNS) {
    for (const p of patterns) {
      if (p.test(lower)) {
        intent = i;
        break;
      }
    }
    if (intent !== "unknown") break;
  }

  // Secondary meeting detection: if classified as reminder but contains meeting keywords/links
  if ((intent === "create_reminder" || intent === "unknown") && (MEETING_KEYWORDS.test(lower) || MEETING_LINK_PATTERN.test(lower))) {
    intent = "create_meeting";
  }

  if (intent === "open_page") {
    const afterTrigger = lower.replace(/^(go\s+to|open|show|navigate\s+to)\s+/i, "").trim();
    const page = PAGE_MAP[afterTrigger] ?? PAGE_MAP[afterTrigger.replace(/\s/g, "")];
    return { intent, page: page ?? "/", raw };
  }

  const date = parseDate(raw);
  const { amount, currency } = parseAmount(raw);
  const title = extractTitle(raw, intent);

  // Extract meeting link/location
  let location: string | undefined;
  let duration: number | undefined;
  if (intent === "create_meeting") {
    const linkMatch = raw.match(/https?:\/\/[^\s]+/i);
    if (linkMatch) location = linkMatch[0];
    const durMatch = lower.match(/(\d+)\s*(?:min|minute|mins|minutes)/);
    if (durMatch) duration = parseInt(durMatch[1]);
    if (!duration) duration = 30; // default 30 min
  }

  return { intent, title, date: date ?? undefined, amount, currency, location, duration, raw };
}
