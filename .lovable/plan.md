# OAuth connector for VantoOS (ChatGPT + Claude sign-in)

Context loaded. Here's the plan.

## What you get
A second, sign-in protected connector at the VantoOS address. ChatGPT or Claude opens a normal VantoOS sign-in screen, then a "Connect ChatGPT to VantoOS" Approve / Cancel screen. After approval, the assistant acts as **you**, under your existing data permissions. The current Claude connection (Railway + mcp-bridge) is left exactly as it is.

## Steps (categorised)

**Permissions/RLS (check first, propose before changing)**
1. Read-only audit of all 33 tables listed in your brief: confirm the owner account can select/insert/update through normal row-level security with its own sign-in. Any table that would block it gets listed with a proposed policy. Nothing is applied without your OK.
2. Audit the 5 shared trading functions: executable by signed-in users, and each rejects a p_user_id that isn't the caller (they already use trading_assert_caller — will confirm in the live definitions).
3. Confirm has_role exists for the contacts admin gate.
4. Re-check that the public schema is intact (the earlier "0 tables" reading) before anything else.

**Backend**
5. Turn on the built-in sign-in server for outside apps with self-registration (no extra settings).
6. Connector definition: name "vantoos", title "VantoOS", version 2.0.0, sign-in token check, 13 tool files (contacts, projects, tasks, reminders, meetings, notes-diary, finance, budget, shopping, travel, trusted-sources, wellness, trading) = 95 tools with the same names, inputs, descriptions and return shapes as today.
7. Every tool: refuse if not signed in; run with the caller's own token (no service-role key, no MCP_OWNER_USER_ID); user id always taken from the token, never from input. Same safety rules as mcp-bridge (field-only updates, no phone edits, append-only notes, task dedupe, soft vs hard deletes, finance mirroring, metadata-only wellness documents, paper-only trading through the shared functions). Read tools marked read-only, deletes marked destructive.

**UI**
8. New Approve/Cancel page at /.lovable/oauth/consent showing app name, your account, and what it can do; handles expired/invalid requests and failures.
9. The sign-in page keeps the return address (email/password and Google) so you land back on the Approve screen, not the dashboard.

**Not touched:** mcp-bridge, its config entry, MCP_BRIDGE_TOKEN / MCP_OWNER_USER_ID, mcp-server/, suite-bridge-hub, kairos-link.

## Risks
- Tables that today only work through the bridge's full-access key may block the signed-in route. Each one will be listed with a proposed policy rather than worked around.
- The connector only goes live after you **publish**; the preview alone isn't enough.
- This is a large port (about 4,000 lines of bridge logic). If credits run low I'll stop cleanly and list which tool files are finished.

## Rollback
Remove src/lib/mcp and the plugin line and republish; the old connector stays unaffected throughout.

## Technical details
- @lovable.dev/mcp-js, mcpPlugin() from stacks/supabase/vite, src/lib/mcp/index.ts + tools/*.ts, shared supabaseForUser factory; auth.oauth.issuer with the direct supabase.co issuer, acceptedAudiences "authenticated", requireOAuthClientClaim kept on.
- Generated supabase/functions/mcp (SDK-owned); manifest extracted after each change.
- Final address: https://zsvaqtlomgofwqkpwxeh.supabase.co/functions/v1/mcp (confirmed after extraction).
