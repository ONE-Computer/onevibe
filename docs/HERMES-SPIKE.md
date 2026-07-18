# HERMES-SPIKE — Hermes tool-calling via the VM LiteLLM router (P13-04)

**Status:** complete
**Date:** 2026-07-18
**VM:** `onecomputer-azure` (onecomputer-sandbox03), 4 vCPU Intel Xeon Platinum 8370C, 16 GB RAM (~9 GB free)
**Router:** `litellm-vm` container, `http://127.0.0.1:47821/v1` (Bearer key read from the container's
own env via `docker inspect` — VM-only use, never committed)
**Artifacts on VM:** `~/hermes-spike/` (test scripts + JSON results)

## Summary

Hermes-3-70B and Hermes-4-70B were registered in the VM LiteLLM router as OpenRouter-backed aliases.
The standard OpenAI `tools` array is **rejected** by OpenRouter's Hermes providers (404 "No endpoints
found that support tool use"), so tool-calling only works via Hermes' **native prompt-level format**
(`<tools>` list in the system prompt, `<tool_call>{...}</tool_call>` blocks in the response text).
With that format, `hermes-3-70b` scored **5/5** on a varied 5-prompt tool-call suite (4 valid tool
calls incl. parallel multi-calls + 1 correct abstention) at 0.23–2.17 s TTFT — matching the
`claude-sonnet-5` alias' 5/5 (which uses the standard `tools` array fine).

## Ollama deviation

The original brief called for a local Ollama + Hermes-3-Llama-3.2-3B spike on the VM. Ollama was
installed (systemd service, active, CPU-only) and `hf.co/bartowski/Hermes-3-Llama-3.2-3B-GGUF:Q4_K_M`
(2.0 GB) was pulled before the approach was changed mid-run to route Hermes through the LiteLLM
router instead. Per instruction the install was **left in place, not uninstalled**; the 3B model was
never benchmarked. To pick it up later:
`ollama run hf.co/bartowski/Hermes-3-Llama-3.2-3B-GGUF:Q4_K_M` (RAM headroom was ~9 GB free at pull time).

## Router setup

`GET /v1/models` initially exposed only Claude-shaped aliases — all mapped to
`openrouter/z-ai/glm-5.2`, except `claude-oasis-5-5` → `openai/gpt-5.5`. **No Hermes entry existed**;
openrouter-prefixed ids (`openrouter/nousresearch/...`, bare `nousresearch/...`, `hermes-3`) are all
rejected with 400 "Invalid model name" — the router only serves models from its config list.

Registration performed (config `/tmp/litellm-conf/config.yaml`, backup at
`/tmp/litellm-conf/config.yaml.bak-hermes-spike`, then `docker restart litellm-vm`):

```yaml
- model_name: hermes-3-70b
  litellm_params:
    model: openrouter/nousresearch/hermes-3-llama-3.1-70b
- model_name: hermes-4-70b
  litellm_params:
    model: openrouter/nousresearch/hermes-4-70b
```

Both aliases then appear in `/v1/models` and serve traffic. Restart downtime was a few seconds;
no other VM services (graphiti-neo4j, a2a-spike, etc.) were touched.

## Tool-call request format: what works and what doesn't

### OpenAI `tools` array — REJECTED for Hermes via OpenRouter

```json
POST /v1/chat/completions
{"model": "hermes-3-70b", "messages": [...], "tools": [...], "stream": true}
```

Both `hermes-3-70b` and `hermes-4-70b` fail with:

```
litellm.NotFoundError: OpenrouterException - {"error":{"message":"No endpoints found that
support tool use. Try disabling \"get_weather\". ...","code":404}}
```

OpenRouter's serving providers for the NousResearch Hermes models do not accept the native `tools`
parameter (for this account/providerset). Rapid retries after the 404 additionally trip 429 rate
limits. The same `tools` payload against `claude-sonnet-5` (GLM-5.2) works fine, so this is a
provider capability gap, not a router or client bug.

### Hermes native prompt-level format — WORKS

Per the Hermes-3/Hermes-4 model cards: inject the tool schemas into the **system prompt** as a
`<tools>` JSON list; the model answers with `<tool_call>{...}</tool_call>` XML blocks in plain text;
the client extracts (regex `<tool_call>\s*(.*?)\s*</tool_call>`), JSON-parses and validates each
block. No `tools` param is sent, so it works through any provider:

```text
You are a function calling AI model. You are provided with function signatures within
<tools></tools> XML tags. You may call one or more functions to assist with the user query.
Don't make assumptions about what values to plug into functions. Here are the available tools:
<tools>
[{"name": "get_weather", "description": "Get the current weather for a city.",
  "parameters": {"type": "object", "properties": {"city": {"type": "string", ...}}, "required": ["city"]}},
 {"name": "search_web", "description": "Search the web for information.",
  "parameters": {"type": "object", "properties": {"query": {"type": "string", ...}}, "required": ["query"]}}]
</tools>
For each function call return a json object with function name and arguments within
<tool_call></tool_call> XML tags as follows:
<tool_call>
{"name": <function-name>, "arguments": <args-dict>}
</tool_call>
If none of the tools are needed, just answer the question directly without any XML tags.
```

Example raw response (multi_berlin prompt, hermes-3-70b — note the parallel calls):

```text
<tool_call>
{"name": "get_weather", "arguments": {"city": "Berlin"}}
</tool_call>
<tool_call>
{"name": "search_web", "arguments": {"query": "Berlin airport strikes"}}
</tool_call>
```

## Measurements

5-prompt suite (system prompt + 2 tools; single-city weather, web search, weather+news multi-call,
no-tool-needed general question, two-city comparison → parallel calls). `stream=true`, `temperature=0.2`.

| Model | Format | Correct | TTFT (s) min/med/max | Total (s) min/med/max |
|---|---|---|---|---|
| `hermes-3-70b` | native prompt | **5/5** | 0.23 / 0.34 / 2.17 | 0.49 / 1.47 / 2.17 |
| `hermes-4-70b` | native prompt | 4/5¹ | 0.20 / 0.27 / 5.26 | 0.39 / 0.46 / 6.03 |
| `claude-sonnet-5`² | OpenAI `tools` | **5/5** | 0.73 / 0.82 / 2.64 | 1.46 / 1.69 / 4.79 |

¹ `hermes-4-70b` emitted valid-JSON tool calls on all 4 tool prompts but **over-triggered** on the
no-tool general-knowledge question (`search_web("capital of France")` instead of answering directly).
`hermes-3-70b` abstained correctly.

² The `claude-sonnet-5` alias currently maps to `openrouter/z-ai/glm-5.2` — the comparison is
Hermes-3-70B vs GLM-5.2-as-served-by-the-router, not Anthropic Claude Sonnet.

Per-prompt detail (`hermes-3-70b`, native format):

| Prompt | Outcome | TTFT | Total |
|---|---|---|---|
| weather in Tokyo | `get_weather({"city":"Tokyo"})` | 2.17 | 2.17 |
| search SpaceX news | `search_web({"query":"latest SpaceX launch news"})` | 0.23 | 0.77 |
| Berlin weather + strikes news | `get_weather(Berlin)` + `search_web(...)` parallel | 0.38 | 1.65 |
| capital of France (no tool) | direct answer, correctly no call | 0.34 | 0.49 |
| compare London vs NYC weather | 2× `get_weather` parallel | 0.33 | 1.47 |

RAM footprint: not applicable (remote OpenRouter inference; VM load unchanged).

## Hermes vs claude-sonnet-5 (via the same router)

- **JSON validity:** both are 100% — every tool call Hermes emitted was well-formed
  `<tool_call>` JSON with correct tool names and argument dicts, including parallel multi-calls.
- **Behavioral accuracy:** hermes-3-70b 5/5, claude-sonnet-5 5/5, hermes-4-70b 4/5
  (abstention failure — surprising regression vs Hermes-3 on this one case).
- **Latency:** comparable; Hermes median TTFT (0.27–0.34 s) is actually faster than the GLM-backed
  alias (0.82 s), though Hermes had wider outliers (up to 5.3 s on hermes-4).
- **Integration cost:** the GLM alias uses the standard OpenAI `tools` array; Hermes via OpenRouter
  requires a prompt-injection + response-parsing shim. Self-hosted Hermes (Ollama/vLLM) would remove
  that gap — Ollama's OpenAI-compatible endpoint does support `tools` for Hermes models.

## Recommendation for ONEVibe

A Hermes-class open model fits ONEVibe as a **cheap routing tier** through the existing LiteLLM
router — it matched the GLM-backed `claude-sonnet-5` alias 5/5 on tool-call correctness at equal or
better median latency, and the router alias is a 6-line config change. The catch is that via
OpenRouter it only speaks the prompt-level `<tool_call>` format, so ONEVibe's tool-call layer needs a
provider-aware fallback (native `tools` param where supported, Hermes-style prompt injection + XML
parsing otherwise) rather than assuming the OpenAI schema everywhere. For **privacy-sensitive or
self-hosted tiers** (customer data that must not leave owned infra), a self-hosted Hermes via
Ollama/vLLM is the natural fit and additionally unlocks the standard `tools` API; it is not (yet) a
drop-in replacement for frontier models on abstention judgement — hermes-4 over-triggered on a
general-knowledge question — so keep frontier routing for ambiguous-intent traffic.

## Reproduce

```bash
ssh onecomputer-azure
export LITELLM_KEY=$(docker inspect litellm-vm --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep '^LITELLM_MASTER_KEY=' | cut -d= -f2)
python3 ~/hermes-spike/test_router_tools.py claude-sonnet-5   # OpenAI tools-array suite
python3 ~/hermes-spike/test_native_router.py hermes-3-70b     # Hermes native prompt suite
python3 ~/hermes-spike/test_native_router.py hermes-4-70b
```

Result JSONs: `~/hermes-spike/results_*.json` on the VM.
