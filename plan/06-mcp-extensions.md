# Phase 5 — MCP + Extensions

> **Goal**: Users can add MCP servers. ONEVibe gains access to real external tools. Skill marketplace works.
> **Exit criterion**: Add the `@modelcontextprotocol/server-filesystem` MCP via the UI → create a task → Claude can list and read files via MCP → result appears in conversation.
> **Tasks**: P5-01 through P5-04 in `TODO.md`
> **Prerequisite**: Phases 1–4 complete.

## Current implementation boundary — 2026-07-17

The local MCP declaration slice is implemented in `server/store.ts` and the local SQLite v6/v7 migrations. The skill marketplace is now implemented through owner-scoped SQLite v8 installations, a GitHub-only catalog/content loader, digest/frontmatter verification, `/api/skills/install` and `/api/skills/:id` routes, Skills Library controls, and provider/demo materialization boundaries. The original design below is a target reference and still overstates capabilities that are intentionally not present: MCP environment secrets, MCP health/tool enumeration, and the two-tool facade remain open. The marketplace remains open for protected Claude/LiteLLM materialization and external GitHub reachability evidence.

---

## Study First

Before implementing, read these OpenWork files in `/tmp/openwork`:
- `apps/server/src/mcp.ts` — full MCP config management; runtime SQLite config pattern
- `apps/server/src/skill-hub.ts` — GitHub-backed skill marketplace; TTL cache pattern
- `ee/apps/den-api/src/mcp/agent.ts` — two-tool MCP facade (`search_capabilities` + `execute_capability`)
- `ee/apps/den-api/src/mcp/search.ts` — token scoring for capability search
- `.opencode/skills/` — actual skill SKILL.md files; this is the format to adopt

---

## P5-01: MCP Config Management

### Concept

MCP (Model Context Protocol) servers extend Claude's capabilities with external tools — filesystem access, web search, GitHub, Linear, Slack, databases, etc. The user defines which MCP servers to activate; they are injected into the agent session at task creation time.

OpenWork's key insight: **store MCP config in SQLite at runtime, not on disk.** This avoids race conditions between the UI writing files and the agent engine reading them.

### Backend

**New table** (add to `server/db/schema.ts` or `server/persistence/`):
```ts
// runtime_mcp_configs table
{
  id: text primaryKey, // e.g. mcp_filesystem_abc123
  name: text notNull, // display name: "Filesystem"
  command: text notNull, // e.g. "npx" or "/usr/local/bin/mcp-server-filesystem"
  args: json, // string[] e.g. ["-y", "@modelcontextprotocol/server-filesystem", "/home/user"]
  env: json, // Record<string, string> — env vars for the MCP process
  enabled: boolean default true,
  userId: text, // scoped to user (from P3-01)
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**New routes** in `server/index.ts`:
```
GET  /api/mcp              → list all MCP configs for current user
POST /api/mcp              → create MCP config
PATCH /api/mcp/:id         → toggle enabled / update
DELETE /api/mcp/:id        → remove MCP config
GET  /api/mcp/:id/health   → test if MCP process starts successfully
```

**Injection** — in `server/claude-sdk-runner.ts`, before starting the agent:
```ts
const mcpConfigs = await db.select().from(runtimeMcpConfigs)
  .where(and(eq(runtimeMcpConfigs.userId, task.userId), eq(runtimeMcpConfigs.enabled, true)))

const mcpServers = mcpConfigs.map(config => ({
  name: config.name,
  command: config.command,
  args: JSON.parse(config.args ?? '[]'),
  env: JSON.parse(config.env ?? '{}'),
}))
// Pass to Claude Agent SDK session config
```

### Frontend

**New settings panel** ("Integrations" or "Tools") accessible from sidebar:
```
[ + Add MCP server ]

┌─────────────────────────────────────────────────┐
│ ⬡ Filesystem           [●] Enabled  [Remove]    │
│   npx @modelcontextprotocol/server-filesystem   │
│   Path: /Users/you/Documents                    │
├─────────────────────────────────────────────────┤
│ ⬡ GitHub               [○] Disabled [Remove]    │
│   npx @modelcontextprotocol/server-github       │
│   Token: ••••••••••••••                         │
└─────────────────────────────────────────────────┘
```

"Add MCP server" opens a form:
- Name (text)
- Command (text, e.g. `npx`)
- Arguments (text, comma-separated, e.g. `-y, @modelcontextprotocol/server-filesystem, /path`)
- Environment variables (key-value pairs, masked for secrets)
- "Test connection" button → calls `/api/mcp/:id/health`

**Preset gallery**: Show common MCP servers as one-click installs:
- Filesystem: `@modelcontextprotocol/server-filesystem`
- GitHub: `@modelcontextprotocol/server-github`
- Web search: `@modelcontextprotocol/server-brave-search`
- PostgreSQL: `@modelcontextprotocol/server-postgres`
- Slack: `@modelcontextprotocol/server-slack`

---

## P5-02: Skill Marketplace

### Concept

Skills are markdown files that inject system-prompt instructions into the agent. OpenWork distributes them via a GitHub-hosted JSON catalog. Each skill has a `SKILL.md` with YAML frontmatter.

**Skill format** (copy OpenWork's pattern exactly):
```markdown
---
name: research
title: Research
description: Evidence-led investigation with source discipline
version: 1.0.0
tags: [research, evidence, sources]
---

# Research Skill

When conducting research:
1. Always cite sources with URLs
2. Distinguish confirmed facts from inferences
3. Flag uncertainty explicitly
...
```

### Backend

**New table**: `skills` — id, name, title, description, content, version, source (`builtin|marketplace|local`), enabled, userId

**Catalog endpoint**: `GET /api/skills/catalog`
- Fetches `https://raw.githubusercontent.com/one-computer/onevibe-skills/main/catalog.json` with 5-minute TTL cache
- Falls back to `server/skill-packs.ts` built-in catalog if fetch fails
- Returns merged list of built-in + marketplace + user-installed skills

**Install endpoint**: `POST /api/skills/install`
- Body: `{ skillId: string }`
- Downloads skill SKILL.md from marketplace GitHub repo
- Stores in `skills` table with `source: 'marketplace'`

### Frontend

Update `src/components/SkillsLibrary.tsx`:
1. "Browse marketplace" button → opens a panel with marketplace skills
2. Each marketplace skill shows: title, description, install button
3. Installed skills show in main grid with a checkmark and uninstall option
4. Fix the 5th-skill silent-rejection bug (P4-12) as part of this work

---

## P5-03: Two-Tool MCP Facade

### Concept

When Claude has access to many MCP tools (e.g. 50+ from multiple MCP servers), the full tool list consumes too much context and slows responses. OpenWork's solution: expose exactly two tools to Claude — `search_capabilities` and `execute_capability`. Claude searches for the right tool by name, then executes it by ID.

This is an optional optimization — implement it only after P5-01 is working and you have users with many MCP servers.

### Implementation

**New endpoint** `POST /api/mcp/agent` — the two-tool MCP facade:

```ts
// search_capabilities tool:
// Input: { query: string }
// Output: Array<{ id: string, name: string, description: string, server: string }>
// Logic: fuzzy token-score all registered MCP tools; return top 10 matches

// execute_capability tool:
// Input: { capabilityId: string, args: Record<string, unknown> }
// Output: tool execution result from the underlying MCP server
```

**Agent steering injection**: In `server/claude-sdk-runner.ts`, add a system-prompt block when this feature is enabled:
```
You have access to a capability search system. When you need a tool:
1. Call search_capabilities with 2-4 keyword variants describing what you need
2. Choose the best match from results
3. Call execute_capability with the matched ID and required args
Never guess tool names — always search first.
```

---

## P5-04: Agent Context Diagnostics

### Concept

A health-check panel that tells the user whether all the pieces are connected. Modeled on OpenWork's `agent-context-diagnostics.ts` — a 7-stage check with structured failure codes.

**Endpoint**: `GET /api/diagnostics`

Runs these checks in order, returning structured results:
```ts
type DiagnosticCheck = {
  id: string
  label: string
  status: 'ok' | 'warning' | 'error'
  detail?: string
  actionOwner?: 'user' | 'admin' | 'system'
}

// Checks:
1. litellm_configured   — ONEVIBE_LITELLM_URL and ONEVIBE_LITELLM_API_KEY set and non-empty
2. claude_reachable     — server-controlled LiteLLM health/model probe succeeds
3. sandbox_configured   — e2b or ONEComputer API key set
4. sandbox_reachable    — sandbox health endpoint returns 200
5. mcp_count            — count of enabled MCP servers
6. mcp_health           — each MCP server: spawn test, list tools
7. db_connected         — database query succeeds
```

**UI**: New "Diagnostics" section in settings sidebar:
```
System Health

✅ Claude API key      Configured
✅ Claude API          Reachable
⚠️ Sandbox            Not configured (tasks run without file isolation)
✅ Database            Connected
✅ MCP servers         2 active (filesystem, github)
❌ GitHub MCP          Tool listing failed — check GITHUB_TOKEN env var
```

Each failing check shows an actionable fix: "Set GITHUB_TOKEN in your .env file".

---

## Test Plan

1. Add filesystem MCP via UI → test connection succeeds → create task "List files in /tmp" → Claude lists them
2. Browse skill marketplace → install "Research" skill → it appears in SkillsLibrary → start a task with it selected → system prompt includes skill content
3. Open diagnostics → see all checks → take down Claude API key → Claude API check turns red
4. `npm run check` → green
