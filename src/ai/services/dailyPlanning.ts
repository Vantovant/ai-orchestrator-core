/**
 * Daily Executive Planning Service
 * Synthesizes calendar, tasks, emails, and goals into a structured daily plan.
 */

import type { PrioritizedTask } from "./taskPrioritization";
import type { CalendarEvent, MeetingBrief } from "./meetingPreparation";
import type { TriagedEmail } from "./emailTriage";

export interface DailyPlanInput {
  date: Date;
  userRole: string;
  calendar: CalendarEvent[];
  tasks: PrioritizedTask[];
  triagedEmails: TriagedEmail[];
  meetingBriefs: MeetingBrief[];
  goals: WeeklyGoal[];
  energyPattern?: EnergyPattern;
}

export interface WeeklyGoal {
  id: string;
  description: string;
  progress: number; // 0-100
  deadline: Date;
}

export interface EnergyPattern {
  peakHours: string[];    // e.g. ["09:00-11:00"]
  lowHours: string[];     // e.g. ["14:00-15:00"]
  preferredDeepWork: string; // e.g. "morning"
}

export interface DailyPlan {
  date: string;
  greeting: string;
  dayOverview: string;
  timeBlocks: TimeBlock[];
  topPriorities: TopPriority[];
  emailActions: EmailAction[];
  delegations: Delegation[];
  endOfDayGoals: string[];
  tomorrowPreview: string;
}

export interface TimeBlock {
  startTime: string;
  endTime: string;
  activity: string;
  type: "meeting" | "deep_work" | "admin" | "break" | "buffer";
  linkedTaskId?: string;
  linkedMeetingId?: string;
  notes?: string;
}

export interface TopPriority {
  rank: number;
  description: string;
  taskId?: string;
  estimatedTime: string;
  blockers?: string[];
}

export interface EmailAction {
  emailId: string;
  action: string;
  scheduledTime?: string;
}

export interface Delegation {
  taskDescription: string;
  delegateTo: string;
  context: string;
  deadline?: string;
}

export function buildDailyPlanPrompt(input: DailyPlanInput): string {
  const dateStr = input.date.toISOString().split("T")[0];

  return `You are an executive AI chief of staff creating a daily plan.

Date: ${dateStr}
Role: ${input.userRole}
${input.energyPattern ? `Energy pattern: Peak ${input.energyPattern.peakHours.join(", ")}, Low ${input.energyPattern.lowHours.join(", ")}, Prefers deep work in ${input.energyPattern.preferredDeepWork}` : ""}

CALENDAR (${input.calendar.length} events):
${input.calendar.map((e) => `- ${e.startTime.toISOString().slice(11, 16)}-${e.endTime.toISOString().slice(11, 16)}: ${e.title} (${e.attendees.length} attendees)`).join("\n")}

TOP TASKS (${input.tasks.length} prioritized):
${input.tasks.slice(0, 10).map((t) => `- [${t.priority}] ${t.title} (~${t.estimatedMinutes ?? "?"}min) — ${t.reasoning}`).join("\n")}

EMAIL SUMMARY (${input.triagedEmails.length} triaged):
${input.triagedEmails.filter((e) => e.urgency !== "low").map((e) => `- [${e.urgency}/${e.category}] ${e.summary}`).join("\n")}

WEEKLY GOALS:
${input.goals.map((g) => `- ${g.description} (${g.progress}% done, due ${g.deadline.toISOString().split("T")[0]})`).join("\n")}

MEETING BRIEFS AVAILABLE: ${input.meetingBriefs.length}

Create a structured daily plan. Schedule deep work during peak energy. Add buffers around meetings. Identify what to delegate.`;
}

export const dailyPlanningTools = [
  {
    type: "function" as const,
    function: {
      name: "generate_daily_plan",
      description: "Generate a structured daily executive plan.",
      parameters: {
        type: "object",
        properties: {
          greeting: { type: "string" },
          dayOverview: { type: "string" },
          timeBlocks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                startTime: { type: "string" },
                endTime: { type: "string" },
                activity: { type: "string" },
                type: { type: "string", enum: ["meeting", "deep_work", "admin", "break", "buffer"] },
                linkedTaskId: { type: "string" },
                linkedMeetingId: { type: "string" },
                notes: { type: "string" },
              },
              required: ["startTime", "endTime", "activity", "type"],
              additionalProperties: false,
            },
          },
          topPriorities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                rank: { type: "number" },
                description: { type: "string" },
                taskId: { type: "string" },
                estimatedTime: { type: "string" },
                blockers: { type: "array", items: { type: "string" } },
              },
              required: ["rank", "description", "estimatedTime"],
              additionalProperties: false,
            },
          },
          emailActions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                emailId: { type: "string" },
                action: { type: "string" },
                scheduledTime: { type: "string" },
              },
              required: ["emailId", "action"],
              additionalProperties: false,
            },
          },
          delegations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                taskDescription: { type: "string" },
                delegateTo: { type: "string" },
                context: { type: "string" },
                deadline: { type: "string" },
              },
              required: ["taskDescription", "delegateTo", "context"],
              additionalProperties: false,
            },
          },
          endOfDayGoals: { type: "array", items: { type: "string" } },
          tomorrowPreview: { type: "string" },
        },
        required: ["greeting", "dayOverview", "timeBlocks", "topPriorities", "endOfDayGoals"],
        additionalProperties: false,
      },
    },
  },
];
