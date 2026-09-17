# Genre and translation playbooks

A phrase can be stale in an essay and necessary in a contract. Choose the genre before applying anti-pattern rules.

## 1. Chat, comments, and direct replies

### Goal

Respond to the person and solve the immediate problem without turning a short exchange into a lecture.

### Protect

- the actual question and emotional temperature
- names, links, code, dates, and promised actions
- uncertainty and boundaries
- the relationship's existing formality

### Prefer

- answer early
- acknowledge only what needs acknowledgment
- use natural contractions or colloquial Chinese when the relationship supports them
- preserve harmless quirks in the user's wording
- stop after the useful answer

### Avoid

- praise before every response
- identity or psychological judgments
- a tutorial outline for a one-line question
- a generic closing offer attached to every reply
- polishing casual language into corporate prose

Default revision freedom: **strict**.

## 2. Status updates, incident notes, and internal reports

### Goal

Make timeline, current state, evidence, owner, risk, and next action easy to find.

### Protect

- timestamps, versions, metrics, thresholds, and environments
- observed versus confirmed status
- owners and responsibility
- blockers, unresolved risks, rollback state, and chronology

### Prefer

- named actions and concrete results
- honest incomplete states
- a next step with its condition
- direct time markers

### Avoid

- “significant progress has been made”
- “risk is under control” without evidence
- hiding a blocker inside a positive summary
- changing `planned` to `underway`, or `fixed` to `verified`

Default revision freedom: **strict**.

## 3. Release notes and changelogs

### Goal

Tell users what changed, what they need to do, what was tested, and what remains limited.

### Protect

- version numbers, dates, commands, flags, issue IDs, API names
- compatibility, migration steps, breaking changes, and known issues
- `Added / Changed / Fixed / Removed / Security` semantics

### Prefer

- concrete change before benefit
- user action near the change that requires it
- measured performance claims with baselines
- limitations stated without apology theater

### Avoid

- launch manifestos
- “exciting new chapter”
- unsupported “faster, safer, more seamless” triads
- burying a breaking change under highlights

Default revision freedom: **strict**.

## 4. README and product documentation

### Goal

Help a reader decide whether the project fits and complete a task successfully.

The first screen should answer:

- what this is
- who it is for
- what problem it solves
- what the quickest valid next step is

### Protect

- command order, prerequisites, code, paths, fields, defaults, and error behavior
- stable terminology used for search
- warnings before risky operations

### Prefer

- direct definitions
- examples that actually run
- explicit failure branches
- repeated key terms where retrieval benefits

### Avoid

- turning docs into a landing page
- replacing stable terms with synonyms
- conversational filler around commands
- moving prerequisites after the action

Default revision freedom: **strict**.

## 5. API reference and FAQ

### API reference

Preserve method, path, authentication, parameters, types, defaults, constraints, literal values, status codes, and request/response examples. Do not infer missing contract details.

### FAQ

Answer early, but keep conditions and warnings in the correct order. Do not turn every interview question or discussion prompt into FAQ format. Do not broaden the question beyond what the answer supports.

Default revision freedom: **strict**.

## 6. Essays, blogs, and public arguments

### Goal

Develop a position through evidence and reasoning rather than through a visible template.

### Prefer

- a supported opening fact, scene, tension, or claim
- sections that follow actual turns in the argument
- explicit limits and counterevidence
- examples close to the claim they support
- a conclusion that changes or sharpens the reader's understanding

### Avoid

- repeating the topic as an introduction
- three benefits, three risks, and a generic future
- empty “what this means” paragraphs
- every section ending with a pull quote
- invented personal experience

Default revision freedom: **standard**.

## 7. Marketing and product copy

Persuasion is allowed. Unsupported persuasion is not.

### Protect

- approved claims, pricing, eligibility, offers, disclaimers, and brand terms
- the exact action the user can take
- audience and product boundaries

### Prefer

- one clear audience
- a concrete problem and mechanism
- proof close to the claim
- a specific call to action
- language consistent with the actual product experience

### Avoid

- benefits that apply to everyone
- `revolutionary`, `seamless`, or `effortless` without evidence
- fake testimonials, invented KPIs, and placeholder logos presented as proof
- twelve emotional hooks competing on one page

Default revision freedom: **standard**, with strict fact locks.

## 8. Email

### Internal email

Lead with the decision, request, or update. Keep context proportional to the recipient's knowledge.

### External or customer email

Politeness may be functional. Do not delete greetings and closings merely because standalone articles should not have chatbot wrappers.

### High-stakes email

Protect commitments, dates, amounts, responsibility, legal posture, and escalation language. Prefer a plain sentence over warmth that weakens the obligation.

Default revision freedom: **strict to standard**.

## 9. Academic and research prose

### Protect

- citations and quotation boundaries
- methods, variables, populations, sample sizes, and statistical relations
- uncertainty, limitations, and distinction between observation and inference
- established technical terminology

### Valid conventions

- passive voice in methods
- nominalization where it names a stable concept
- repeated terminology
- cautious modality
- structured headings

### Avoid

- inventing a citation
- turning correlation into causation
- replacing a technical term because it appears on an AI-word list
- stripping hedges that encode scientific uncertainty
- adding broad societal significance not supported by the study

Default revision freedom: **strict**.

## 10. Legal, compliance, medical, financial, and safety text

Accuracy and approved wording outrank naturalness.

- Treat obligations, permissions, prohibitions, warnings, contraindications, and disclaimers as protected.
- Do not simplify a term when the simpler word changes legal or technical scope.
- Do not add reassurance, predicted outcomes, or individualized advice.
- Flag awkward fixed language instead of silently changing it.

Default revision freedom: **strict**.

## 11. Fiction and narrative non-fiction

### Fiction

Invented people and scenes are allowed. The test is internal causality and viewpoint, not source citation.

Prefer action, choice, changed information, relationship pressure, and consequence. Sensory detail should arise from what the viewpoint character notices while doing something.

### Narrative non-fiction

Do not invent weather, dialogue, room details, motives, gestures, or precise times. A vivid lie is still a lie. Use sourced scenes, attributed recollection, or transparent reconstruction.

Default revision freedom: **creative** for fiction, **strict to standard** for narrative non-fiction.

## 12. Social posts and short-form scripts

Short form can be direct and rhythmic without turning every line into suspense.

Prefer:

- one idea per post or segment
- a concrete first line
- spoken sentences that fit a breath for voiceover
- platform conventions that match the account's real history

Avoid:

- generic `stop scrolling`
- a reveal on every line
- decorative emoji quotas
- fake urgency or fabricated personal confession
- turning a nuanced point into an unsupported absolute

Default revision freedom: **standard**.

# Translation playbook

Translate meaning and function, not source syntax. The target text should read as if it was composed in the target language for the same reader and purpose.

## 1. Translation order

1. Read the complete source and identify its job.
2. Build the fidelity ledger: names, terms, numbers, modality, scope, attribution, and formatting.
3. Restate the meaning in the target language without looking sentence-by-sentence at the source structure.
4. Compare against the source for omissions and drift.
5. Remove target-language translationese.
6. Read aloud in the target language.

## 2. English to Chinese

Common risks:

- preserving English clause order
- overly long pre-nominal modifiers
- unnecessary passive constructions
- repeated `基于……通过……来……`
- translating every discourse marker
- copying English abstract nouns into `进行/实现/完成 + 名词`
- treating `you` as `您` in every genre

Example:

Source:

> The study, conducted by a Stanford team, suggests that the model may perform better on tasks with explicit intermediate feedback.

Natural Chinese:

> 斯坦福一个团队的研究显示，任务如果提供明确的中间反馈，这个模型的表现可能更好。

Protect `suggests` and `may`; do not turn the result into proof.

## 3. Chinese to English

Common risks:

- preserving topic-comment shells too literally
- translating four-character phrases into inflated abstractions
- using `conduct`, `realize`, `promote`, or `empower` for ordinary actions
- omitting the subject because Chinese permits it
- converting a cautious Chinese statement into direct English certainty
- adding articles, examples, or causal links not present in the source

Example:

Source:

> 这次只验证了两个异常分支，暂时不能说明主链路已经稳定。

Natural English:

> We tested only two error branches, so we cannot yet conclude that the main path is stable.

Use `we` only if the source context identifies the speaker as the testing team. Otherwise use `The test covered...`.

## 4. Terminology

Use, in order:

1. the user's glossary
2. official product, legal, or standards terminology
3. an approved style guide
4. stable domain usage
5. a plain translation

Once chosen, keep the term stable. Do not rotate synonyms for variety.

## 5. Quotations and titles

- Preserve quotation status and attribution.
- Do not silently back-translate an official title when an established localized title exists.
- If no official translation exists, choose one transparent rendering and keep it stable.
- Never “improve” a quotation inside quotation marks.

## 6. Localization versus translation

Localization may change date format, units, examples, formality, spelling, and platform conventions. Make these changes only when the user requests localization or the target context clearly requires it. Do not silently convert a legal jurisdiction, currency, measurement, or cultural reference.
