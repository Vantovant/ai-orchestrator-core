/**
 * Meeting Preparation Service
 * Generates pre-meeting briefs, agendas, talking points,
 * and post-meeting action item extraction.
 */

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  attendees: Attendee[];
  description?: string;
  location?: string;
  isRecurring: boolean;
  previousNotes?: string;
}

export interface Attendee {
  name: string;
  email: string;
  role?: string;
  relationship?: string;
}

export interface MeetingBrief {
  meetingId: string;
  summary: string;
  agenda: AgendaItem[];
  talkingPoints: string[];
  attendeeContext: AttendeeInsight[];
  preparationActions: string[];
  estimatedDecisions: string[];
}

export interface AgendaItem {
  topic: string;
  timeAllocation: string;
  owner?: string;
  notes?: string;
}

export interface AttendeeInsight {
  name: string;
  recentInteractions: string;
  relevantContext: string;
}

export interface ActionItem {
  description: string;
  assignee?: string;
  deadline?: string;
  priority: "high" | "medium" | "low";
}

export function buildMeetingPrepPrompt(
  event: CalendarEvent,
  userContext: { role: string; recentEmails?: string[]; activeProjects?: string[] }
): string {
  return `You are an executive AI assistant preparing a meeting brief.

Meeting: "${event.title}"
Time: ${event.startTime.toISOString()} - ${event.endTime.toISOString()}
Location: ${event.location ?? "Virtual"}
Description: ${event.description ?? "None provided"}
Recurring: ${event.isRecurring ? "Yes" : "No"}
Previous notes: ${event.previousNotes ?? "None"}

Attendees:
${event.attendees.map((a) => `- ${a.name} (${a.email})${a.role ? `, ${a.role}` : ""}${a.relationship ? ` — ${a.relationship}` : ""}`).join("\n")}

User role: ${userContext.role}
${userContext.activeProjects?.length ? `Active projects: ${userContext.activeProjects.join(", ")}` : ""}
${userContext.recentEmails?.length ? `Recent relevant emails: ${userContext.recentEmails.join("; ")}` : ""}

Generate a comprehensive meeting preparation brief.`;
}

export function buildActionExtractionPrompt(
  meetingTitle: string,
  transcript: string
): string {
  return `Extract action items from this meeting.

Meeting: "${meetingTitle}"
Transcript/Notes:
${transcript}

Return structured action items with assignees and deadlines where identifiable.`;
}

export const meetingPrepTools = [
  {
    type: "function" as const,
    function: {
      name: "generate_meeting_brief",
      description: "Generate a pre-meeting preparation brief.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string" },
          agenda: {
            type: "array",
            items: {
              type: "object",
              properties: {
                topic: { type: "string" },
                timeAllocation: { type: "string" },
                owner: { type: "string" },
                notes: { type: "string" },
              },
              required: ["topic", "timeAllocation"],
              additionalProperties: false,
            },
          },
          talkingPoints: { type: "array", items: { type: "string" } },
          preparationActions: { type: "array", items: { type: "string" } },
          estimatedDecisions: { type: "array", items: { type: "string" } },
          attendeeContext: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                recentInteractions: { type: "string" },
                relevantContext: { type: "string" },
              },
              required: ["name", "recentInteractions", "relevantContext"],
              additionalProperties: false,
            },
          },
        },
        required: ["summary", "agenda", "talkingPoints", "preparationActions"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "extract_action_items",
      description: "Extract action items from meeting notes or transcript.",
      parameters: {
        type: "object",
        properties: {
          actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                assignee: { type: "string" },
                deadline: { type: "string" },
                priority: { type: "string", enum: ["high", "medium", "low"] },
              },
              required: ["description", "priority"],
              additionalProperties: false,
            },
          },
        },
        required: ["actions"],
        additionalProperties: false,
      },
    },
  },
];
