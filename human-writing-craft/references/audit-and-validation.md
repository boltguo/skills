# Audit and validation

An audit should produce evidence and editing decisions, not a verdict about authorship.

## 1. Audit taxonomy

Use the smallest applicable category.

### Content

- unsupported significance
- vague or invented attribution
- unsupported certainty or precision
- generic challenge/future material
- fabricated intimacy, experience, or sensory detail
- repetition that adds no new information

### Structure

- topic-announcement opening
- outline-expanded article
- repeated staged contrast
- forced symmetry or triads
- sections with no distinct job
- recap or uplift ending

### Sentence and language

- hidden or false actor
- translationese
- cliché cluster
- synonym cycling
- abstract wrapper over concrete evidence
- repeated cadence or sentence skeleton
- filler intensifier or meta-commentary

### Presentation

- chatbot wrapper
- excessive headings, bold, emoji, or cards
- list inflation
- title or punctuation convention mismatch
- accidental edits to protected material

## 2. Confidence

Confidence describes how certain the editing diagnosis is, not whether AI wrote the text.

- **High:** the problem is directly observable and harmful in context, such as an unsupported source, changed number, chatbot closing, or repeated empty sentence.
- **Medium:** a pattern cluster is visible, but genre or voice could justify it.
- **Low:** a single surface feature such as one dash, one cliché word, one passive sentence, or one rhetorical question.

Low-confidence findings should usually be omitted from the report unless the user requested an exhaustive scan.

## 3. Severity

- **Critical:** factual drift, changed responsibility, broken warning, fabricated source, or altered legal/technical token.
- **Major:** structure obscures the argument; repeated unsupported claims; substantial voice mismatch.
- **Moderate:** a recurring pattern reduces clarity, trust, or rhythm.
- **Minor:** local awkwardness with little effect on the piece.

Fidelity issues outrank style issues.

## 4. Audit-only procedure

1. Read the entire piece before marking anything.
2. Identify genre, audience, and protected material.
3. Find pattern clusters and exact excerpts.
4. Explain the function that fails in this piece.
5. Recommend an operation: keep, delete, compress, specify, re-attribute, merge, split, reorder, or verify.
6. Report only the most material findings unless exhaustive mode was requested.
7. Do not rewrite the text.

Use [../assets/audit-report.md](../assets/audit-report.md).

## 5. Surface scanner boundaries

`scripts/audit_text.py` is deliberately limited. It can locate explicit phrases, punctuation density, vague attribution, chatbot residue, and several formatting patterns. It cannot reliably judge:

- whether a claim is true
- whether a source exists elsewhere
- whether paragraph rhythm is intentional
- whether a metaphor works
- whether a writer's voice is authentic
- whether a passage was produced by AI

Scanner output is a lead list. A human or language model must inspect context before editing.

## 6. Objective gate versus taste gate

Separate what can be verified from what must be judged.

### Objective gate

Use scripts or direct comparison for:

- names, numbers, dates, versions, units, and links
- required sections and output format
- code, commands, paths, and identifiers
- explicit phrase or formatting requirements
- missing citations or quotation boundaries
- frontmatter and file integrity

### Taste gate

Use representative samples and human review for:

- whether the voice feels like the writer
- whether humor, warmth, or bluntness fits
- whether a structural change improves the argument
- whether rhythm feels natural
- whether an unusual sentence should remain

Do not convert the taste gate into a numerical pseudo-objective score. A rubric can organize discussion, but the writer's judgment remains authoritative.

## 7. Suggested craft rubric

Use only when comparison helps. Rate 1–5 with evidence.

| Dimension | Question |
|---|---|
| Fidelity | Did every load-bearing claim and relation survive? |
| Purpose | Does the piece perform the requested job? |
| Specificity | Are claims supported by actors, examples, conditions, or evidence? |
| Coherence | Does each section follow from the last and add something? |
| Voice fit | Does the register match the writer, audience, and genre? |
| Rhythm | Is variation functional rather than repetitive or artificially broken? |
| Restraint | Does the text avoid overclaiming, overexplaining, and decorative intensity? |

Do not add the numbers into an “AI likelihood.” Fidelity is pass/fail regardless of the average.

## 8. Blind comparison for important revisions

When practical, compare the previous and revised versions without labels.

Ask the reviewer:

- Which version better serves the reader and purpose?
- Which preserves the source more accurately?
- Which sounds more like the supplied samples?
- What exact passage caused the choice?

A single blind comparison is a pilot, not a benchmark. Repeated preferences across varied pieces are stronger evidence.

## 9. Regression checks

A new anti-pattern rule can damage valid writing. Before promoting a rule, test it on:

- an already-human passage
- technical documentation
- academic prose
- casual chat
- marketing copy
- a passage where the target feature is intentionally effective
- Chinese and English separately when the rule claims to cover both

The rule should reduce the target problem without flattening unrelated text.

## 10. Final validation checklist

### Fidelity

- [ ] names, numbers, dates, units, versions, and links match
- [ ] actor, responsibility, causality, negation, scope, and modality match
- [ ] quotations, code, commands, warnings, and fixed terms remain intact
- [ ] no new factual or experiential claim appeared without support

### Craft

- [ ] the opening begins the subject
- [ ] each major section has a distinct job and support
- [ ] repeated pattern clusters have been resolved or intentionally retained
- [ ] terminology stays stable
- [ ] rhythm does not become uniformly smooth or uniformly choppy
- [ ] the ending adds or completes rather than recaps and uplifts

### Delivery

- [ ] output mode matches the request
- [ ] no chatbot wrapper remains in a standalone artifact
- [ ] audit mode did not rewrite
- [ ] file-edit mode changed only authorized regions
- [ ] unresolved accuracy risks are visible rather than guessed away
