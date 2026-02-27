/**
 * Email Triage Service
 * Classifies, prioritizes, and drafts responses for incoming emails.
 */

export interface Email {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  receivedAt: Date;
  threadId?: string;
  hasAttachments: boolean;
  labels?: string[];
}

export type EmailCategory =
  | "action_required"
  | "decision_needed"
  | "fyi"
  | "delegation"
  | "follow_up"
  | "spam"
  | "personal";

export type EmailUrgency = "immediate" | "today" | "this_week" | "low";

export interface TriagedEmail {
  emailId: string;
  category: EmailCategory;
  urgency: EmailUrgency;
  summary: string;
  suggestedAction: string;
  draftReply?: string;
  delegateTo?: string;
  followUpDate?: string;
  confidence: number;
}

export interface TriageContext {
  userEmail: string;
  userRole: string;
  directReports: string[];
  vipContacts: string[];
  activeProjects: string[];
}

export function buildTriagePrompt(
  emails: Email[],
  context: TriageContext
): string {
  return `You are an executive AI assistant triaging emails.

User: ${context.userEmail} (${context.userRole})
Direct reports: ${context.directReports.join(", ") || "None"}
VIP contacts: ${context.vipContacts.join(", ") || "None"}
Active projects: ${context.activeProjects.join(", ") || "None"}

Emails to triage:
${emails
  .map(
    (e, i) => `--- Email ${i + 1} ---
ID: ${e.id}
From: ${e.from}
Subject: ${e.subject}
Received: ${e.receivedAt.toISOString()}
Attachments: ${e.hasAttachments ? "Yes" : "No"}
Body (truncated): ${e.body.slice(0, 500)}
`
  )
  .join("\n")}

Classify each email and suggest actions. Draft replies where appropriate.`;
}

export function buildReplyDraftPrompt(
  email: Email,
  instruction: string,
  userContext: { name: string; role: string; tone?: string }
): string {
  return `Draft a reply to this email.

Original email:
From: ${email.from}
Subject: ${email.subject}
Body: ${email.body}

Instruction: ${instruction}
Reply as: ${userContext.name} (${userContext.role})
Tone: ${userContext.tone ?? "professional and concise"}

Write only the reply body, no subject line.`;
}

export const emailTriageTools = [
  {
    type: "function" as const,
    function: {
      name: "triage_emails",
      description: "Classify and prioritize a batch of emails.",
      parameters: {
        type: "object",
        properties: {
          triaged: {
            type: "array",
            items: {
              type: "object",
              properties: {
                emailId: { type: "string" },
                category: {
                  type: "string",
                  enum: [
                    "action_required",
                    "decision_needed",
                    "fyi",
                    "delegation",
                    "follow_up",
                    "spam",
                    "personal",
                  ],
                },
                urgency: {
                  type: "string",
                  enum: ["immediate", "today", "this_week", "low"],
                },
                summary: { type: "string" },
                suggestedAction: { type: "string" },
                draftReply: { type: "string" },
                delegateTo: { type: "string" },
                followUpDate: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
              required: [
                "emailId",
                "category",
                "urgency",
                "summary",
                "suggestedAction",
                "confidence",
              ],
              additionalProperties: false,
            },
          },
        },
        required: ["triaged"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "draft_email_reply",
      description: "Draft a reply to a specific email.",
      parameters: {
        type: "object",
        properties: {
          reply: { type: "string" },
          tone: { type: "string" },
          suggestedSubject: { type: "string" },
        },
        required: ["reply"],
        additionalProperties: false,
      },
    },
  },
];
