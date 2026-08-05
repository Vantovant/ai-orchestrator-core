# VantoOS MCP Server

Lets Claude read and update `hub_contacts` in VantoOS (ai-orchestrator-core) via four tools:
`list_contacts`, `get_contact`, `update_contact`, `add_contact_note`.

Two-layer architecture, same pattern as the Get Well Hub and Vanto Zazi CRM sessions:

```
Claude → mcp-server (Railway, this folder)  → mcp-bridge (Supabase Edge Function)  → hub_contacts
         holds the tool definitions            holds the DB logic + service-role key
```

## 1. Add these two files to your repo

- `supabase/functions/mcp-bridge/index.ts` — copy from the `mcp-bridge/` folder in this download bundle.
- `mcp-server/` — this whole folder (package.json, src/index.js, this README).

Since the GitHub connector can't push directly (same 403 write issue as your other two apps), add both
via your local clone:

```cmd
cd D:\GitHub\ai-orchestrator-core
:: copy the downloaded mcp-bridge folder into supabase\functions\mcp-bridge\
:: copy the downloaded mcp-server folder into the repo root
git add supabase/functions/mcp-bridge mcp-server
git commit -m "Add MCP bridge and server for Claude contact tools"
git push origin main
```

## 2. Register the mcp-bridge function with Supabase

Add to `supabase/config.toml`:

```toml
[functions.mcp-bridge]
verify_jwt = false
```

This function authenticates via a custom `x-mcp-token` header, not a Supabase user session — same
reason `maytapi-hub-bridge` and `suite-bridge-hub` also have `verify_jwt = false`.

Then, exactly like the Get Well Hub session found: **a plain `git push` updates the source Lovable sees,
but does not redeploy the live Supabase function.** Ask Lovable's own chat to sync from the latest GitHub
commit and deploy `mcp-bridge` — this is a lightweight sync, not new code generation.

## 3. Set secrets

**On Supabase** (for `mcp-bridge`):
- `MCP_BRIDGE_TOKEN` — generate a long random value, e.g. `openssl rand -hex 32`

**On Railway** (for `mcp-server`):
- `MCP_BRIDGE_URL` — `https://<your-project-ref>.supabase.co/functions/v1/mcp-bridge`
- `MCP_BRIDGE_TOKEN` — the *same* value you set on Supabase in the step above
- `MCP_SERVER_TOKEN` — a second, separate random value — this is what Claude's connector will present

## 4. Deploy to Railway

Same monorepo gotcha as the Zazi CRM session: since `mcp-server/` is a subfolder of the main repo,
set **Source → Root Directory → `mcp-server`** in the Railway service settings, or Railway will try to
build the whole frontend app instead.

Expected clean boot log:
```
> vantoos-mcp@1.0.0 start
> node src/index.js
VantoOS MCP server listening on port 8080
```

## 5. Connect Claude

In claude.ai → Settings → Connectors → Add custom connector:
- URL: `https://<your-railway-app>.up.railway.app/mcp`
- API key: the `MCP_SERVER_TOKEN` value from step 3

If tool calls fail with "Requested function was not found" after everything above looks right, that's
almost certainly the same root cause as the Zazi CRM session: the Supabase function was never actually
deployed (see step 2). Confirm with a direct curl to the bridge before assuming it's a Claude connector bug:

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/mcp-bridge \
  -H "Content-Type: application/json" \
  -H "x-mcp-token: <MCP_BRIDGE_TOKEN>" \
  -d '{"action":"list_contacts","body":{"limit":3}}'
```

A `401` with the wrong token, or a real contact list with the right one, both confirm the bridge is live.
Anything else (especially a generic "not found") points back at the Lovable redeploy step.

## Notes on scope

Deliberately excluded from this first version, matching the caution from the Zazi CRM build: any
WhatsApp-send capability, contact deletion, and any action touching `suite-bridge-hub`'s spoke-signing
secrets. This server only ever talks to `mcp-bridge`, which only ever touches `hub_contacts` — it cannot
sign directives to spokes or trigger sends.

`add_contact_note` appends to the `notes` column directly (timestamped, newline-joined) rather than
writing to a separate activity-log table, since `hub_contacts` in this schema doesn't have one — unlike
Get Well Hub's `contact_activities` table. Worth adding one later if per-note structure (author, type,
timestamp as real columns) becomes useful.
