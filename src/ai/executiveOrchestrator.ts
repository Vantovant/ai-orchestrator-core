/**
 * Executive Orchestrator — Central AI Pipeline
 *
 * Coordinates the four AI services (task prioritization, meeting preparation,
 * email triage, daily planning) into a unified executive intelligence layer.
 *
 * Integration point: call `runMorningBriefing()` from your API route
 * or invoke individual pipelines as needed.
 */

import {
  type Task,
  type PrioritizedTask,
  type PrioritizationContext,
  buildPrioritizationPrompt,
  parsePrioritizationResponse,
  taskPrioritizationTools,
} from "./services/taskPrioritization";

import {
  type CalendarEvent,
  type MeetingBrief,
  buildMeetingPrepPrompt,
  meetingPrepTools,
} from "./services/meetingPreparation";

import {
  type Email,
  type TriagedEmail,
  type TriageContext,
  buildTriagePrompt,
  emailTriageTools,
} from "./services/emailTriage";

import {
  type DailyPlanInput,
  type DailyPlan,
  buildDailyPlanPrompt,
  dailyPlanningTools,
} from "./services/dailyPlanning";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AIGatewayConfig {
  baseUrl: string;
  apiKey: string;
  model?: string;
  maxRetries?: number;
}

export interface OrchestratorInput {
  user: {
    email: string;
    name: string;
    role: string;
    directReports: string[];
    vipContacts: string[];
  };
  tasks: Task[];
  calendar: CalendarEvent[];
  emails: Email[];
  goals: { id: string; description: string; progress: number; deadline: Date }[];
  activeProjects: string[];
  recentCompletions: string[];
  energyPattern?: DailyPlanInput["energyPattern"];
}

export interface OrchestratorOutput {
  prioritizedTasks: PrioritizedTask[];
  meetingBriefs: MeetingBrief[];
  triagedEmails: TriagedEmail[];
  dailyPlan: DailyPlan;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// AI Gateway caller (plugs into your existing gateway)
// ---------------------------------------------------------------------------

async function callAI(
  config: AIGatewayConfig,
  messages: Array<{ role: string; content: string }>,
  tools?: any[],
  toolChoice?: any
): Promise<any> {
  const model = config.model ?? "google/gemini-2.5-flash";
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < (config.maxRetries ?? 2); attempt++) {
    try {
      const body: Record<string, unknown> = { model, messages };
      if (tools) body.tools = tools;
      if (toolChoice) body.tool_choice = toolChoice;

      const res = await fetch(`${config.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        const wait = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      if (!res.ok) {
        throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      const choice = data.choices?.[0];

      // If tool call response, parse the function arguments
      if (choice?.message?.tool_calls?.[0]) {
        return JSON.parse(choice.message.tool_calls[0].function.arguments);
      }

      return choice?.message?.content ?? "";
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastError ?? new Error("AI call failed");
}

// ---------------------------------------------------------------------------
// Pipeline stages
// ---------------------------------------------------------------------------

async function prioritizeTasks(
  config: AIGatewayConfig,
  tasks: Task[],
  context: PrioritizationContext
): Promise<PrioritizedTask[]> {
  if (tasks.length === 0) return [];

  const prompt = buildPrioritizationPrompt(tasks, context);
  const result = await callAI(
    config,
    [{ role: "user", content: prompt }],
    taskPrioritizationTools,
    { type: "function", function: { name: "prioritize_tasks" } }
  );

  return parsePrioritizationResponse(tasks, result.prioritized);
}

async function prepareMeetings(
  config: AIGatewayConfig,
  events: CalendarEvent[],
  userContext: { role: string; recentEmails?: string[]; activeProjects?: string[] }
): Promise<MeetingBrief[]> {
  // Prepare briefs in parallel
  const briefs = await Promise.all(
    events.map(async (event) => {
      const prompt = buildMeetingPrepPrompt(event, userContext);
      const result = await callAI(
        config,
        [{ role: "user", content: prompt }],
        meetingPrepTools,
        { type: "function", function: { name: "generate_meeting_brief" } }
      );
      return { meetingId: event.id, ...result } as MeetingBrief;
    })
  );

  return briefs;
}

async function triageEmails(
  config: AIGatewayConfig,
  emails: Email[],
  context: TriageContext
): Promise<TriagedEmail[]> {
  if (emails.length === 0) return [];

  // Batch in groups of 10 to stay within context limits
  const batches: Email[][] = [];
  for (let i = 0; i < emails.length; i += 10) {
    batches.push(emails.slice(i, i + 10));
  }

  const results = await Promise.all(
    batches.map(async (batch) => {
      const prompt = buildTriagePrompt(batch, context);
      const result = await callAI(
        config,
        [{ role: "user", content: prompt }],
        emailTriageTools,
        { type: "function", function: { name: "triage_emails" } }
      );
      return result.triaged as TriagedEmail[];
    })
  );

  return results.flat();
}

async function generateDailyPlan(
  config: AIGatewayConfig,
  input: DailyPlanInput
): Promise<DailyPlan> {
  const prompt = buildDailyPlanPrompt(input);
  const result = await callAI(
    config,
    [{ role: "user", content: prompt }],
    dailyPlanningTools,
    { type: "function", function: { name: "generate_daily_plan" } }
  );

  return { date: input.date.toISOString().split("T")[0], ...result } as DailyPlan;
}

// ---------------------------------------------------------------------------
// Main orchestration entry point
// ---------------------------------------------------------------------------

export async function runMorningBriefing(
  config: AIGatewayConfig,
  input: OrchestratorInput
): Promise<OrchestratorOutput> {
  const now = new Date();

  // Stage 1: Run task prioritization and email triage in parallel
  const [prioritizedTasks, triagedEmails] = await Promise.all([
    prioritizeTasks(config, input.tasks, {
      currentTime: now,
      userRole: input.user.role,
      activeGoals: input.goals.map((g) => g.description),
      recentCompletions: input.recentCompletions,
    }),
    triageEmails(config, input.emails, {
      userEmail: input.user.email,
      userRole: input.user.role,
      directReports: input.user.directReports,
      vipContacts: input.user.vipContacts,
      activeProjects: input.activeProjects,
    }),
  ]);

  // Stage 2: Prepare meeting briefs (can run after we have context)
  const todayEvents = input.calendar.filter((e) => {
    const eventDate = e.startTime.toISOString().split("T")[0];
    return eventDate === now.toISOString().split("T")[0];
  });

  const meetingBriefs = await prepareMeetings(config, todayEvents, {
    role: input.user.role,
    activeProjects: input.activeProjects,
  });

  // Stage 3: Synthesize everything into a daily plan
  const dailyPlan = await generateDailyPlan(config, {
    date: now,
    userRole: input.user.role,
    calendar: input.calendar,
    tasks: prioritizedTasks,
    triagedEmails,
    meetingBriefs,
    goals: input.goals,
    energyPattern: input.energyPattern,
  });

  return {
    prioritizedTasks,
    meetingBriefs,
    triagedEmails,
    dailyPlan,
    generatedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Individual pipeline exports (for API routes)
// ---------------------------------------------------------------------------

export {
  prioritizeTasks,
  prepareMeetings,
  triageEmails,
  generateDailyPlan,
};

export type {
  Task,
  PrioritizedTask,
  CalendarEvent,
  MeetingBrief,
  Email,
  TriagedEmail,
  DailyPlan,
};
