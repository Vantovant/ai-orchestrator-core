# VantoOS — AI Provider Architecture

## Overview

VantoOS uses a multi-provider AI gateway with automatic fallback to ensure executive AI features remain available even when individual providers experience issues.

## Provider Order

### Default ("Prefer fastest")
1. **Lovable AI** (primary) — Google Gemini via Lovable gateway
2. **Gemini Direct** — Google's Generative AI API
3. **OpenAI** — GPT-4o-mini

### Alternative ("Prefer quality")
1. **Lovable AI** (primary)
2. **OpenAI** — GPT-4o-mini
3. **Gemini Direct**

Users can switch preference in **Settings → AI Preferences**.

## Architecture

```
┌──────────────┐     ┌──────────────┐
│ run-assistant│────▶│  ai-gateway  │──▶ Lovable AI → Gemini → OpenAI
└──────────────┘     └──────────────┘
┌──────────────┐           │
│finance-mentor│───────────┘
└──────────────┘
```

All AI calls route through the `ai-gateway` edge function, which:
- Tries providers in order based on user preference
- Returns structured JSON with `ai_status` and `provider_used`
- Handles timeouts (30s per provider)
- Never exposes API keys to the client

## Secrets (Server-Side Only)

| Secret | Where | Purpose |
|--------|-------|---------|
| `LOVABLE_API_KEY` | Auto-provisioned | Lovable AI Gateway access |
| `GEMINI_API_KEY` | Edge Function secret | Direct Gemini API fallback |
| `OPENAI_API_KEY` | Edge Function secret | OpenAI API fallback |

**⚠️ None of these keys are ever sent to the frontend or stored in the database.**

## Response Contract

Every AI-powered endpoint returns:

```json
{
  "ai_status": "ok | degraded | rate_limited | error",
  "provider_used": "lovable | gemini | openai | none",
  "message": "Human-readable status note"
}
```

## Token Discipline

All providers receive the same curated snapshot — never raw database tables.
See `snapshot-build` and `finance-snapshot-build` for snapshot construction.
