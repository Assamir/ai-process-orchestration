# Prompting and Metaprompting: Good vs. Bad Practices

A reference for engineering prompts, agent instructions, and instruction-generating meta-prompts. The recurring theme: write generalized, verifiable, well-grounded instructions and treat their authoring as an iterative, human-led process — not a one-shot drafting pass that trusts the model to infer intent.

## ✅ Good practices

- **Write instructions for a category of tasks, as goals, limits, and reusable patterns** — State the objective, the constraints to respect, and universal schemas/patterns, then let the model choose its execution order; baking in a rigid step sequence or data-specific steps means you actually wanted a workflow, not an agent. This generalizes across the combinatorial space of contexts and avoids whack-a-mole regressions. —

- **Generalize rules into behavior categories instead of patching individual errors** — A rule bound to one specific failure (e.g. a single `add_task`/`add_event` mistake) fixes only that case; a generalized reasoning procedure (think aloud, state confidence, ask to clarify) handles a broad class of tools and tasks. —

- **Write generic exploration rules, not case-specific commands** — Over-specific instructions fix only one query while over-broad ones cause noise; durable guidance is a set of generic principles (scan structure first, deepen via concise queries, explore cause/effect and part/whole links, verify coverage before acting) that the agent applies to choose its own path. —

- **Invest in precise field names and descriptions in your schemas** — A schema guarantees structure, but the values are generated from the field names and descriptions, so clear, concise naming directly raises output quality; an LLM can draft a schema but a human must finalize it. —

- **Include neutral/unknown enum values rather than forcing a choice** — Offering `neutral`, `mixed`, or `unknown` alongside `positive`/`negative` prevents the model from fabricating a label when the input genuinely doesn't support one, reducing hallucination. —

- **Order schema fields so reasoning precedes the conclusion it informs** — Because each generated token conditions the next, placing a `reasoning` field before `sentiment` (and `confidence` after) improves the downstream values. —

- **Use few-shot examples to teach a procedure, not just describe it** — For knowledge, putting it in context suffices; to make the model follow a specific method, concrete user/model examples let it recognize and reuse the pattern far more reliably than prose rules — especially for universal traits unlikely to bias task accuracy. —

- **Tell the model its own limits and what to do when information is missing** — Models hallucinate by guessing (inferring an email from a name, inventing a page's contents). Tell it whether tools like web search are active, and instruct it to ask for clarification or halt when information is insufficient, decompose the task, and reduce context volume. —

- **Make the model ask and wait rather than guess missing inputs** — When an instruction is built from a Q&A flow, tell the model to wait for answers and probe unclear instructions instead of guessing information it should receive from the user. —

- **Use structured (JSON) prompts and reference images for control and consistency** — A structured JSON prompt plus reference imagery (poses, composition) gives controllable, repeatable results — important when a character or product must stay consistent across many frames. The structure also pays off in maintainability, mattering as much for the human as for the model. —

- **Treat the agent persona/profile as functional, not cosmetic** — Tone, complexity, length, format, and named reasoning techniques actually steer where the model focuses attention and measurably affect output quality (like "don't think of blue butterflies"), so design them deliberately. —

- **Build agent instructions iteratively with AI, grounded in concrete failure observations, then judge the output yourself** — Effective prompts emerge from many revision cycles informed by real observed failures, not one drafting pass; the model can propose changes and justify behavior but ~60% of its suggestions are useless, so the human must steer toward generalization and tool-independence and add their own judgment. —

- **Use frontier models as thinking partners for crafting generalized instructions** — Strong models struggle to autonomously produce highly generalized, open-ended agent instructions, yet they are excellent collaborators in the human-led shaping process; the human role stays essential. —

- **Repeat critical rules — at the end of long instructions and in message metadata — and reinforce via tool results** — Long context erodes instruction-following and models drift back to their default tone, so restate the most important rules and prohibitions at the very end, echo them in user-message metadata, and return behavioral hints alongside tool outputs. —

- **Shape behavior with reinforcing patterns and metadata, not hard-coded actions** — Steering an agent toward attitudes and thought patterns (via metadata on user messages and tool outputs) generalizes better than enumerating specific actions, letting the model adapt style and focus to the situation. —

- **Recognize that an instruction's presence does not guarantee compliance** — Don't assume that writing a rule means the model will follow or correctly interpret it; this calls for iteration, reinforcement, and verification rather than one-shot authoring. —

- **Ask the model to justify its decisions to reveal failure causes** — A stated rationale isn't a faithful account of internal computation, but in practice the explanation often contains concrete hints that help diagnose tool-selection and other failures. —

- **Encode tool-design good practices into the prompt to drive better iterations** — Feeding the model an explicit list of design rules (or a few example commands and asking it to extract their principles) lets it generalize those rules across the whole integration and rapidly improve schemas. —

- **Treat the system prompt as public** — Prompt injection can extract the system prompt, so it must never contain secrets or exploitable data. —

- **Place variable data last to maximize prompt caching** — Keeping the prompt prefix static and repeatable caches more tokens (cheaper than fresh input), so put variable fields like id/description at the end to stay within tight token/cost budgets. —

- **Refine and paraphrase the user's query before launching deep research** — Clarifying questions plus a preliminary search narrow and enrich the query, improving any non-instant task that benefits from a precisely formulated request. —

- **Use a meta-prompt with a Data/Generator/Result structure to generate agent instructions** — A reusable meta-prompt interviews the user to collect missing info (goal, scope, style, tools, patterns, constraints, format, exceptions), then shapes it via encoded prompt best-practices into a structured result (identity, reasoning, rules, external knowledge, voice) — systematizing instruction creation across use cases. —

- **Split complex prompt generation into separate phases** — A large meta-prompt has distinct stages (process, strategy, adaptation, format, rules, generation) better decomposed into grouped phases than kept as one monolith. —

- **Build the core behavior as a plain prompt before formalizing it into a skill** — Validate the core instruction conversationally until it produces roughly the right output before investing structure around it; a common mistake is starting with advanced patterns before the core works. Pick skill vs. prompt by the rule-of-three: a repeatable process warrants a skill, a one-off edit/explanation stays a prompt. —

- **Keep agent instructions and workflows as simple as possible** — Models have limited ability to hold attention over long instructions, so simple skill/workflow descriptions are executed more reliably; spread complexity across linked notes the agent discovers progressively. —

- **Pin tasks to concrete files and tool names instead of relying on inference** — For automated/background messages, naming specific files and tools (or even tool categories or folders, or resolving a path via a `#` palette) reliably steers the agent toward the correct solution path; cheap explicit grounding beats hoping the agent locates the right resources. —

- **Treat investing in agent instructions as high-ROI infrastructure** — Polishing agent prompts and background commands is a one-time effort that pays back repeatedly on every subsequent run, justifying upfront care. —

- **Build a reusable personal library of simple, repeatable prompts** — Identify the queries you send repeatedly and bind them to shortcuts, macros, or agent skills; even a few frequently-reused instructions deliver outsized value despite being trivial to create. —

- **Keep agent messages short and single-intent in conversational protocols** — Asking for many things in one message degrades multi-turn reliability; concise, single-purpose turns keep the exchange on track. —

- **Re-evaluate prompting best practices on each model migration** — Newer models don't always follow instructions better, and previously recommended techniques can become counterproductive (e.g. an aggressive ALL-CAPS `CRITICAL`/`MUST` tone is no longer recommended for newer Opus), so re-test prompts rather than assuming they port. —

- **Run closed-loop automatic prompt optimization with a stronger judge model** — Models can iteratively optimize their own prompts via analyze/optimize/evaluate loops, keeping changes that raise a measured score; one demo lifted accuracy from 60% to 90% over 10 rounds using a smaller model to execute and a stronger one to optimize. —

- **Externalize prompts as signatures using frameworks like DSPy/Ax** — Defining inputs, task, and expected outputs as "signatures" rather than hand-written strings lets tooling auto-optimize instructions and generate few-shot examples into a reusable demos file, keeping brittle prompts out of application code. —

- **Operate at the requirement level and let the agent translate to CLI syntax** — Ask in natural language ("show entry points", "show only hubs") and let the agent compose the concrete `rg`/`git`/`depcruise` invocations and flags, so you iterate by correcting in plain language instead of memorizing tool syntax. —

- **Start rule files from a built-in generator, then review by hand** — A command like `/init` gives safe-default scaffolding (build/test/format commands, structure, conventions), but the generated draft still needs manual pruning so it captures local conventions rather than restating docs the agent can already read. —

- **Apply an inclusion test before adding any rule** — Ask whether public training data could have prepared the agent for this; if yes, don't add it. Belongs: non-obvious conventions, atypical naming, unsafe-to-infer import rules, project traps, workarounds. Doesn't belong: mainstream framework docs, README commands, "use strict mode", "write clean code". —

- **Make rules focused, executable, and scoped — not statements of intent** — A good rule tells the agent what to do differently in a specific place, as a checkable behavior; replace "write readable code" with "avoid the `any` type" or delete it. Strip generic advice and restated framework defaults — strike any line you could write without opening the repo. —

- **Write specific guardrails, not vague ones, including an explicit out-of-scope section** — Concrete negative rules like "NEVER auto-chain to the next skill" are enforceable; "be careful" gives the model nothing actionable. Add a "what this skill does NOT do" section — forgetting it is a top skill failure mode. —

- **Emit concrete, runnable fixes instead of generic advice** — Require every recommendation to name the exact command: "Add tests" is not a fix; "Run `npm init vitest@latest`, then add a test script" is. Carry an effort estimate per entry. —

- **Hide internal step/gate labels and define jargon inline; mirror the user's language** — Speak to users in plain language ("dependency audit", not step numbers or gate jargon), define terms like "wedge"/"north star" on first use so output reads cold, and answer end-to-end in the user's language (e.g. Polish PRD -> Polish questions). —

- **Run an opinionated but capped, gated interview offering real alternatives** — Cap the interview at a few anchor questions, each a strong "Recommend" grounded in a quoted artifact line with reasonable alternatives, an escape hatch ("Not sure / haven't decided"), and a marked default — avoiding both performative interrogation and silently deciding load-bearing calls. —

- **Forbid strawman options in user-facing choices** — Every alternative offered must carry a real "why this is reasonable" clause tied to artifact signal; options listed only to make the recommendation look right degrade trust and must be removed. —

- **Embed designed-in escape hatches against over-precision** — Detect novel/unfamiliar inputs and soften recommendations ("my best read is X, but the artifact signal is thin"), allowing extra dialogue exactly where the heuristics weren't built to apply. —

- **Reflect mechanical inputs back into outside-observable form before capturing** — Normalize requirements phrased as mechanism ("rate-limit per IP", "Postgres query < 50ms") into externally measurable targets ("auth resists credential stuffing", "user-perceived response < 800ms p95") to keep them stack-agnostic and avoid locking in implementation prematurely. —

- **Generate documents against a locked, externally-referenced schema** — Constraining generation to a fixed, separately-referenced schema makes LLM output structurally predictable and machine-checkable and gives downstream tools a stable contract. —

- **Use Socratic challenge to interrogate the user's idea rather than transcribe it** — An agent that challenges and probes requirements (vision -> persona -> MVP -> FRs) surfaces hidden complexity and weak scoping early, producing a far stronger spec than passive note-taking. —

- **Scale output depth to artifact complexity** — Tier verbosity by input size (concise for small, detailed for large) so output stays proportionate; don't pad simple inputs with generic filler or under-cover complex ones. —

- **Adapt the report to the artifact type instead of forcing a fixed template** — Applying skill-specific sections (chain position, allowed-tools) to a plain prompt file produces nonsense; skip sections that don't apply and drop mechanics sections when there's nothing meaningful to say. —

- **Adapt the interview to project state instead of asking dead questions** — Skip questions whose answer is obviously useless (don't ask "what feels undertested?" on a greenfield repo) and re-aim them ("where is the biggest gap that worries you?") to keep elicitation high-signal. —

- **Give every recommendation a justification plus alternatives** — Each interview question offers one recommended option with reasoning tied to the source artifact, one or two genuine alternatives, and an escape hatch, so the human can meaningfully ratify rather than rubber-stamp a default. —

- **Surface rejected alternatives, not just the chosen design** — For each structural choice, state the choice, the rejected alternative, and why this way wins (e.g. state-in-file vs. in-memory vs. sidecar); this teaches the design space instead of inviting cargo-culting. —

- **Treat shipped workflows and skills as editable starting points, not gospel** — Plan/review/implement skills and section templates emerge from many hours of iteration; expect to open `SKILL.md` and tune fields, sections, statuses, and naming/priority conventions to your own tools and repo quirks. —

- **Have the agent restructure vague input into a diagnostic contract before guessing** — A raw user report is the hardest debugging entry point; make the agent restructure it into repro steps, scope, frequency, and suspected area to convert ambiguity into a workable contract before any solution attempt. —

- **Separate observation, hypothesized cause, and proposed fix to avoid misframing** — A wrongly framed problem fuses symptom with a guessed solution, so research just produces ever-more-detailed answers to the wrong question; forcing the three layers apart (and asking whether the fix was inherited from a prior conversation) catches inherited assumptions. —

- **Distinguish missing-evidence problems from wrong-framing problems** — Research addresses a lack of data; reframing addresses approaching the task from the wrong side. Reaching for research when the real issue is framing wastes effort, and the needed order (frame, then research, then plan) varies by what actually blocks the work. —

- **Force discovery, source citation, and explicit unknowns — never invented names** — Prompts that forbid assuming entity/aggregate names or requirement numbers and require `file:line` citations (with explicit "MISSING in code" annotations) produce a verifiable map grounded in the repo rather than a plausible fabrication; label each claim evidence/inference/unknown and write "unknown" rather than guess. —

- **Forbid the agent from forcing premature approval** — Ending exploration with "do you approve?" forces an unread decision under pressure; instruct the agent to finish by simply writing the report, preserving the generate-then-understand discipline. —

- **Use anti-confirmation-bias prompting to counter model sycophancy** — Models default to agreeing with whatever stance you signaled, so invert the question ("why is X a bad choice?") and run structured challenges — devil's advocate, pre-mortem, and unknown-unknowns — to force a more objective result. —

- **Force comparison tables and role-perspective prompts instead of single-option evaluation** — Asking a model to evaluate one option invites praise; demand three real alternatives in a structured table (adoption cost, maintenance, learning curve, key limitation) and have it argue from multiple stakeholder roles to surface trade-offs a single perspective hides. —

- **Supply expected behavior in the prompt so the model isn't its own oracle** — State the rule ("10% above 200, 15% above 500 — test those thresholds") and the assumptions to interpret so the expected result comes from the human/spec, not from the code — directly defeating the oracle problem instead of asking "write tests for this function". —

- **Specify expected behavior as observable outcomes, not internal mechanics** — Describe what is observable from outside ("returns 401 when user lacks course access", "only accepted drafts reach the deck") without dictating function names, mock placement, or private methods, yielding behavioral assertions that survive refactors. —

- **Scaffold tests with an oracle-from-sources stage and a stop-and-ask gate** — A structured prompt can require deriving behavior from PRD/tech-stack, writing behavioral assertions with risk-based edge cases, and stopping to ask when correct behavior is ambiguous — forcing the agent to ask rather than copy the implementation. —

- **Seed the generator with one exemplar test — "what you show is what you get"** — An LLM faithfully copies the patterns in a provided seed test, so a single high-quality example (role selectors, wait-for-state, unique IDs, cleanup, risk-named) propagates good practice — but a `waitForTimeout(2000)` in the seed propagates that anti-pattern everywhere. —

- **Re-prompt by naming the specific anti-pattern, not "fix this test"** — A targeted correction with three elements — what is wrong, why it fails to protect the risk (or causes false failures), and which pattern replaces it — is far more reliable than a vague "improve it". —

## ❌ Anti-patterns

- **Assuming prompts execute line-by-line like deterministic code** — Believing the LLM will follow instructions sequentially and honor embedded if/loop conditions exactly like program logic leads to brittle designs that break under the model's actual probabilistic behavior. —

- **Assuming the agent will infer underspecified intent** — Treating vague instructions as sufficient because "the agent will figure it out" disappoints once novelty fades; expecting flawless file/tool handling, self-recovery from errors, and error-free output for unspecified requirements is unrealistic. The belief that prompt engineering no longer matters because capable models just understand intent is explicitly a mistake — instruction quality still determines effectiveness. —

- **Over-steering with overly direct instructions or heavy few-shot blocks** — Models tend to suggest overly literal fixes (e.g. "pass video links directly to `analyze_video`") that couple the agent to its current tools, and large few-shot blocks bias behavior and only suit narrowly specialized agents. —

- **Treating reasoning as a fragile-proof cure-all** — Reasoning can hurt simple tasks and is sensitive to prompt structure — merely reordering premises can drop accuracy by up to 40% — so it shouldn't be blindly trusted or over-controlled. —

- **Relying on temperature/top_p for genuine output diversity** — Tuning sampling parameters only marginally increases variety; outputs stay heavily anchored to preceding context, so counting on these knobs alone for creative or diverse behavior disappoints. —

- **Vague "agent, analyze this module" prompts** — An open-ended "analyze the module" is barely better than "read the whole repo": the agent opens whatever files match a name, follows imports, summarizes, and rushes to suggest refactors without ever proving it understood the real data flow. —

- **"Vibe testing" — prompting "write tests for X" without risk or behavior context** — Naive prompts produce implementation-mirror tests, happy-path-only suites, and missing edge cases that validate current behavior rather than user-relevant behavior; the canonical failure is `authenticate(input)` asserted to equal `authenticate(input)`. —
