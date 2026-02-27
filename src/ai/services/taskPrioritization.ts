/**
 * Task Prioritization Service
 * Plugs into the executive orchestrator to rank and prioritize tasks
 * using AI-driven scoring based on urgency, impact, and context.
 */

export interface Task {
  id: string;
  title: string;
  description?: string;
  deadline?: Date;
  source: "email" | "calendar" | "manual" | "slack" | "project";
  tags?: string[];
  assignedBy?: string;
  estimatedMinutes?: number;
}

export interface PrioritizedTask extends Task {
  score: number;
  priority: "critical" | "high" | "medium" | "low";
  reasoning: string;
  suggestedTimeSlot?: string;
}

export interface PrioritizationContext {
  currentTime: Date;
  userRole: string;
  activeGoals: string[];
  recentCompletions: string[];
}

const PRIORITY_THRESHOLDS = {
  critical: 0.85,
  high: 0.65,
  medium: 0.4,
  low: 0,
} as const;

function classifyPriority(score: number): PrioritizedTask["priority"] {
  if (score >= PRIORITY_THRESHOLDS.critical) return "critical";
  if (score >= PRIORITY_THRESHOLDS.high) return "high";
  if (score >= PRIORITY_THRESHOLDS.medium) return "medium";
  return "low";
}

export function buildPrioritizationPrompt(
  tasks: Task[],
  context: PrioritizationContext
): string {
  return `You are an executive AI assistant performing task prioritization.

Current time: ${context.currentTime.toISOString()}
User role: ${context.userRole}
Active goals: ${context.activeGoals.join(", ")}
Recently completed: ${context.recentCompletions.join(", ")}

Tasks to prioritize:
${tasks.map((t, i) => `${i + 1}. [${t.source}] "${t.title}" ${t.deadline ? `(deadline: ${t.deadline.toISOString()})` : ""} ${t.description ?? ""}`).join("\n")}

For each task, return a JSON array of objects with:
- id: the task id
- score: 0-1 float representing priority weight
- reasoning: one sentence explaining the score
- suggestedTimeSlot: optional ISO time suggestion`;
}

export function parsePrioritizationResponse(
  tasks: Task[],
  aiResponse: Array<{ id: string; score: number; reasoning: string; suggestedTimeSlot?: string }>
): PrioritizedTask[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  return aiResponse
    .map((entry) => {
      const task = taskMap.get(entry.id);
      if (!task) return null;
      return {
        ...task,
        score: entry.score,
        priority: classifyPriority(entry.score),
        reasoning: entry.reasoning,
        suggestedTimeSlot: entry.suggestedTimeSlot,
      } satisfies PrioritizedTask;
    })
    .filter(Boolean)
    .sort((a, b) => b!.score - a!.score) as PrioritizedTask[];
}

export const taskPrioritizationTools = [
  {
    type: "function" as const,
    function: {
      name: "prioritize_tasks",
      description: "Score and rank a list of tasks by priority.",
      parameters: {
        type: "object",
        properties: {
          prioritized: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                score: { type: "number", minimum: 0, maximum: 1 },
                reasoning: { type: "string" },
                suggestedTimeSlot: { type: "string" },
              },
              required: ["id", "score", "reasoning"],
              additionalProperties: false,
            },
          },
        },
        required: ["prioritized"],
        additionalProperties: false,
      },
    },
  },
];
