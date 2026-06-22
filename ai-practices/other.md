# AI / Agent Engineering Practices: Other

A reference of cross-cutting practices for building and deploying AI/agent systems — model selection, deployment strategy, tooling, and the engineer's mindset — distilled from course material.

## ✅ Good practices

- **Match model cost and tier to task difficulty** — Search-and-extract loops or repeatable visual diagnostics rarely benefit from frontier reasoning models; a cheaper model (e.g. a budget VLM or fast flash tier) is a sensible default that controls cost over many LLM calls without hurting quality, with open-weight local models trading speed for zero API cost. Pin model *categories*, not names, since names age fast.

- **Treat your beliefs about AI as provisional and update them constantly** — Capability moves fast in both directions: yesterday's "impossible" becomes trivial while seemingly simple things prove hard. Assume your convictions may be wrong the moment they form, and keep re-assessing what is genuinely easy to ship versus what only looks easy.

- **Don't assume a safeguard or control is impossible before analyzing options** — Risks can't be fully eliminated, but prematurely declaring a control infeasible forgoes partial mitigations that — even if they require a human in the loop and block full automation — still deliver large value.

- **Start with documents and prompts as the lightest AI deployment** — A shared prompt or a few files (checklist, onboarding doc, style guide, AGENTS.md / Skills file) can deliver real time-savings and standardization at near-zero cost before building heavier agent systems.

- **Use a visual UI to surface and manage agent suggestions** — The same model output pasted into a chat is hard to notice and act on; a dedicated UI with per-suggestion accept/reject controls turns raw LLM output into actionable, reviewable work.

- **Use coding agents to visualize agent-system logic** — Asking a coding agent to render orchestration logic as Mermaid or HTML makes complex multi-agent designs reviewable, but designers must still oversee the result because models tend to over-complicate or omit important branches.

- **Learn implementation detail from tool-builders' blogs, not vendor marketing** — Marketing articles from implementation firms rarely contain the details that matter; the engineering blogs and repos of the people building the actual tools (LlamaIndex, Vercel, Langfuse, Cloudflare, HumanLayer, etc.) are far more useful sources.

- **Design tools into existing habits and environment, because adoption is the hard part** — Building the capability is easy; sustained use is the real challenge. A daily newsletter or MCP integration delivers no value if it's never read, so route outputs into the tools and moments people already use (Discord, phone, leaving-home triggers) to make agents stick.

- **Account for data-privacy tiers and provider jurisdiction before sending code to an LLM API** — Whether your code trains a model or is legally accessible to third parties depends on the provider and tier: API/business tiers are usually private by default while consumer tiers often train by default, and some jurisdictions compel state data access with no opt-out — so corporate code needs a compliance check before use.

- **Keep one investigation structure portable across tools and entry points** — Tools differ across stacks (Datadog vs Sentry, Cypress vs Playwright) and the first signal may be a unit test or a vague ticket, but the reusable asset is the structure: where evidence comes from, in what order, fused into a diagnosis via multi-source synthesis, a hypothesis-confirming test, and per-layer verification.

## ❌ Anti-patterns

_None recorded._
