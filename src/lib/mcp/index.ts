import { auth, defineMcp } from "@lovable.dev/mcp-js";
import contacts from "./tools/contacts";
import projects from "./tools/projects-notes-diary";
import tasks from "./tools/tasks";
import reminders from "./tools/reminders";
import meetings from "./tools/meetings";
import finance from "./tools/finance";
import budget from "./tools/budget";
import shopping from "./tools/shopping";
import travel from "./tools/travel";
import trustedSources from "./tools/trusted-sources";
import wellness from "./tools/wellness";
import trading from "./tools/trading";
import location from "./tools/location";

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

// Deliberately NOT exposed (human-only in the app): risk_percent,
// learning_mode, mentor_reviewed, paper balance, verifying key levels,
// deleting trades/levels/plans, anything touching real money or a broker.
export default defineMcp({
  name: "vantoos",
  title: "VantoOS",
  version: "2.0.0",
  instructions:
    "VantoOS executive command center. Tools act as the signed-in user: contacts (admins only), projects, notes, voice diary, tasks, reminders, meetings, finance, budget, shopping, travel, trusted sources, wellness, paper-only trading and GPS trip timelines (stops, legs, delays).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    ...contacts, ...projects, ...tasks, ...reminders, ...meetings, ...finance,
    ...budget, ...shopping, ...travel, ...trustedSources, ...wellness, ...trading, ...location,
  ],
});
