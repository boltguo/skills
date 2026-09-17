# Preservation contract

Style edits are reversible. Meaning drift is not. Build the preservation ledger before changing prose.

This contract separates **literal locks** from **semantic locks**. Literal locks preserve exact tokens. Semantic locks preserve relationships, strength, conditions, and status even when wording changes.

## 1. Literal locks

Keep these verbatim unless the user explicitly authorizes changes.

### Names and identifiers

- people, organizations, products, locations, modules, and services
- issue, PR, RFC, ticket, case, patent, law, and standard identifiers
- usernames, handles, domains, email addresses, IDs, hashes, and account numbers
- capitalization and punctuation that belong to a proper name

Do not rename the same object merely to avoid repetition. Stable terminology improves retrieval and reduces ambiguity.

### Numbers and measurement

- counts, percentages, prices, dates, times, durations, and ranges
- versions, units, thresholds, limits, sample sizes, and confidence intervals
- comparison baselines and the object each number modifies

Keep each number attached to the same object and relation.

- `3 of 10 groups passed` is not `three tests passed`.
- `latency fell by 40%` is not `latency fell to 40%`.
- `under 100 ms` is not `about 100 ms`.
- `between May and July` is not `in summer` when the dates matter.

Do not round, localize, normalize, or reformat values unless the requested house style permits it and the value remains exact.

### Quotations and attribution

Protect:

- words inside direct quotations
- speaker, publication, date, and source attached to a quotation
- quoted labels, titles, laws, policies, errors, and contractual terms

Never paraphrase a sentence and leave quotation marks around the paraphrase. Never assign a statement to a different speaker or convert an allegation into an established fact.

### Technical and structured tokens

Protect:

- source code and code fences
- commands, flags, file paths, URLs, anchors, and environment variables
- API methods, endpoints, parameters, fields, enum values, headers, and literal values
- log lines, stack traces, status codes, metric names, database columns, and configuration keys
- Markdown link targets and reference labels

Spelling, case, punctuation, underscores, hyphens, escaping, and meaningful whitespace may be contractual. Improve prose around a token, not the token itself.

### Fixed formal language

Protect approved:

- legal disclaimers and regulatory wording
- safety warnings and medical instructions
- contractual clauses
- controlled vocabulary and glossary entries
- publication-mandated boilerplate

Flag awkward fixed text rather than silently changing the obligation.

## 2. Semantic locks

These may be rephrased, but their logical relation must survive.

### Actor and responsibility

Track who:

- performed an action
- made a decision
- observed or claimed a result
- owns a risk or next step
- is permitted, required, or prohibited from acting

`The vendor will investigate` must not become `we will investigate`. Passive voice can be correct when the actor is unknown, irrelevant, protected, or intentionally unspecified. Do not invent an actor to satisfy an active-voice rule.

### Polarity, scope, and exceptions

Protect relations expressed by:

- `not`, `never`, `no longer`, `without`
- `only`, `at least`, `at most`, `except`, `unless`
- `all`, `some`, `most`, `may`, `must`, `should`, `can`
- `before`, `after`, `until`, `while`, `during`

Small words can carry the entire constraint. Never drop them as filler.

### Modality and certainty

Keep distinctions such as:

- observed / inferred / suspected / confirmed / proved
- possible / probable / expected / required
- estimate / target / forecast / measured result
- association / contribution / cause

Examples:

- `may improve` must not become `improves`.
- `was associated with` must not become `caused`.
- `the team plans to release` must not become `the team is releasing`.
- `tests suggest` must not become `tests prove`.

### Status and completion

Track whether work is:

- proposed
- scheduled
- started
- partially complete
- complete
- deployed
- observed
- verified
- rolled back

`Fixed` and `verified in production` are different states. Do not make a timeline sound more complete to improve cadence.

### Causality, comparison, and direction

Preserve:

- cause versus correlation
- input versus output
- increase versus decrease
- absolute versus relative change
- baseline and comparison group
- prerequisite versus consequence
- necessary versus sufficient condition

A nearby sentence is not automatically evidence of causation. Do not join two facts with `therefore` unless the source supports the inference.

### Risk, warning, and limitation

Do not soften or hide:

- blockers
- unresolved defects
- security or safety risks
- eligibility conditions
- known limitations
- failure branches
- rollback instructions

A polished summary must not make an unresolved state look settled.

## 3. Structural locks

In strict revision and file-edit mode, preserve unless authorized:

- heading hierarchy
- paragraph and list order
- table rows and columns
- quotation boundaries
- code block locations
- numbered procedure order
- warning placement before an action
- footnotes, references, and link targets

Formatting can encode meaning. Moving a warning below the command it qualifies is not a cosmetic change.

## 4. The fidelity ledger

For longer or high-risk text, use a compact internal ledger.

| Item | Type | Source form | Required relation |
|---|---|---|---|
| `v2.4.1` | literal | release version | exact token |
| `23%` | literal + semantic | error-rate reduction | stays attached to error rate and same baseline |
| Acme Corp | literal | responsible vendor | remains the actor |
| `may` | semantic | uncertainty | claim remains tentative |
| warning block | structural | prerequisite | remains before the command |

The template in [../assets/fidelity-ledger.md](../assets/fidelity-ledger.md) is optional. Do not expose the ledger unless the user asks for it.

## 5. Bidirectional verification

Run both directions. A one-way comparison misses invented material.

### Source → result

For every source claim, ask:

- Is it still present?
- Is the actor unchanged?
- Are numbers attached to the same object and baseline?
- Are qualifications, exceptions, and uncertainty still present?
- Has chronology or status changed?

### Result → source

For every factual result claim, ask:

- Where did this come from?
- Did the rewrite add a source, motive, example, statistic, or causal link?
- Did a stylistic expansion create a stronger claim?
- Did a new anecdote imply firsthand experience the writer never supplied?

If no source supports a factual claim, remove it, research it, or mark the gap. Do not keep it because it sounds plausible.

## 6. Safe compression

Compression is allowed only when every load-bearing relation survives.

Original:

> The team completed 3 of 10 migration groups by September 12. The remaining 7 groups are blocked by a schema mismatch, and production rollout has not started.

Unsafe:

> The migration is underway and should reach production soon.

Safe:

> By September 12, the team had completed 3 of 10 migration groups. A schema mismatch blocks the other 7, and production rollout has not started.

The safe version is shorter without improving the status or inventing a forecast.

## 7. When fidelity and fluency conflict

Prefer fidelity. A slightly awkward but accurate sentence is better than a smooth falsehood. Flag the constraint when fixed terminology or formal language prevents a natural rewrite.
