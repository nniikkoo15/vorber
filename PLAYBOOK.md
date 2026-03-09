# Playbook

Principles and heuristics for building Vorber — and for collaborating on it effectively. Updated as we learn. Not project-specific rules (those live in CLAUDE.md and spec.md) — this is the higher-order layer.

---

## 1. Build Strategy

**Prefer vertical slices over broad unfinished systems.**
A working narrow feature is better than a half-built wide one. Each slice should be independently testable before the next begins.

**Implement observable behavior before optimization.**
If the user cannot perceive a change, debugging it becomes ambiguous. Make the thing work visibly first, then make it fast or clean.

**Do not add configurability before core behavior is stable.**
No feature flags, toggles, or "future-proofing" until the core case is solid and understood. Three similar lines of code is better than a premature abstraction.

**Separate concept change from implementation change.**
If a new request implies changing what something *is* (not just what it *does*), flag it and stop. Concept changes require updating spec.md and slices.md before touching code.

**Recurring bugs in the same feature are architecture signals, not code signals.**
If the same behavior keeps breaking, the spec is missing a rule — not the code. Fix the rule first.

---

## 2. Spec Discipline

**Every feature should define: user goal, behavior, success criteria.**
"Add X" is not a spec. "User drags layer A onto layer B; if B is empty it moves; if loaded it swaps; success = correct data in store, visual confirms" is.

**Write interaction contracts in prose before touching state.**
For any persistent panel, overlay, or mode: define every open trigger, every close trigger, every transition. Do this before writing a single line of code. (We fixed the trim panel open/close the hard way — 4 iterations — before writing the contract explicitly.)

**Explicitly define live vs confirmed interactions.**
Live = change is reflected immediately as user acts (e.g. dragging trim handle). Confirmed = change only applies on explicit commit (e.g. a "Save" button). These have very different state requirements.

**Define what feedback is shown after each action.**
What does the user see immediately? What persists? What disappears on next action? Ambiguity here causes the most UI bug cycles.

**Define invalid states and fallback behavior.**
What happens if the user hits an edge case? Silence is not an answer. Define it so the fallback is intentional, not accidental.

---

## 3. UX / Interactivity Heuristics

**If the user cannot perceive a change, debugging becomes ambiguous.**
Always build visible feedback before building invisible logic. Confirmed = something changes on screen.

**Every destructive action should be reversible or clearly warned.**
Clear, delete, overwrite — these need either undo or an explicit confirmation. No silent data loss.

**Hidden dependency between controls should be made visible.**
If changing A affects B, the user should be able to see the relationship. Split-pair layer linking is an example: the connector line makes the dependency visible.

**Immediate feedback beats documentation for core actions.**
If the user has to read instructions to understand what just happened, the feedback is wrong. Design the feedback first.

**Interaction contracts before UI state code.**
Before implementing any open/close/toggle behavior: write out in plain English every trigger that opens it and every trigger that closes it. Ambiguity at this stage causes cascading bugs.

---

## 4. Technical Heuristics

**Check platform constraints before choosing implementation strategy.**
Before writing a feature that depends on a platform API (drag-and-drop, file access, audio, etc.), ask: does this runtime actually support it as expected? (Example: HTML5 DnD is unreliable in WKWebView — Tauri's macOS webview — even with `draggable=true`. Pointer events work reliably. Discovering this mid-implementation costs a full rewrite.)

**Add debug visibility before deep refactor.**
If a bug is not reproducible or not clearly understood, add logging/visibility first. Don't refactor based on a guess.

**Test state boundaries before polishing UI.**
Get the data right before making it look right. A polished UI on wrong state is harder to debug than an ugly UI on correct state.

**Prefer simple explicit data flow over clever indirection.**
Module-level variables for shared audio state, direct store access via `useStore.getState()` for imperative paths — these are more debuggable than clever reactive chains. Clarity over elegance.

**Treat recurring bugs as architecture/spec signals.**
If you fix something and it breaks again differently, the fix addressed a symptom. Stop and read the spec.

---

## 5. Friction Checkpoint

When something feels wrong, messy, awkward, or too complex — before doing anything else.

There are three layers. The middle one is the one that gets skipped.

**Signal** — something feels off. Raw, unresolved, possibly nameless.

**Framing** — what category of problem is this actually? This is the step to not skip.
Possible categories:
- Tooling mismatch / solution-space not surveyed (wrong tool, or existing tool not checked before building)
- Feedback loop too slow or opaque
- Missing precision or visibility into state
- Workflow mismatch (doing it in the wrong order or context)
- Absent capability (feature genuinely missing)
- Direction uncertainty (not sure what the right outcome looks like yet)

**Response** — what do I do next? Not the full solution. The cheapest next learning step.
Possible responses: use an existing tool, change the process, sketch or prototype cheaply, postpone, build a real thing.

**The mandatory pause — before turning any friction into a build task:**

1. State the raw friction in one sentence.
2. Name what category of problem this might be.
3. Name at least two plausible response paths — including "does this already exist?"
4. Choose the cheapest next learning step — not the fullest solution.
5. If the right response is still unclear after the pause: record it as an unresolved signal. Do not force it into spec or implementation.

*The design tweaker (two days, scrapped) was a framing failure. The signal was present. The jump skipped category diagnosis and went straight to "build a tool." The existing tool (Figma MCP) was already available.*

---

## 6. Questions — Before Speccing

Ask these before defining what to build:

- What is the exact user action that triggers this?
- What should happen immediately (within the same gesture)?
- What should persist after the gesture ends?
- What can fail, and what does the user see when it does?
- What is already visible on screen? What needs to change?
- What is the smallest verifiable slice of this?
- Is this a bug fix, a comfort improvement, or a new feature? (Different scope implications.)
- Does this imply a concept change? If so, stop and flag it.

---

## 7. Questions — Before Coding

Ask these before writing implementation:

- Is there a Figma reference? (Always ask for UI changes before implementing.)
- What is the interaction contract? (Every open trigger, every close trigger, every transition.)
- What platform constraints apply? (Runtime, OS, webview, native APIs.)
- Does this belong in the current slice, or should it be logged as a future slice?
- What is the success criterion — how will we know it works?
- What existing behavior must not break?
- Does this mechanism already exist? If yes: challenge the replacement request — ask whether to extend or improve what's there instead of duplicating it. Call out concrete consequences of the existing approach not generalizing (e.g. "anchored to `.layer-side`, won't work for `.slot-circle`"). Compare options against established UX patterns, name the pattern, where it's used, and why it fits or doesn't fit this context.

---

## 8. Anti-Patterns

- Coding before behavior is fully specified
- Mixing multiple concept changes in one step or one commit
- Fixing UI state bugs without first writing the interaction contract
- Fixing symptoms (the bug) without updating the cause (the spec or architecture)
- Adding future-facing flexibility before the core case is stable
- Building beyond the current slice without flagging it
- Polishing UI before the underlying data flow is correct
- Choosing an implementation approach without checking platform constraints first
- Adding comments, docstrings, or cleanup to code that wasn't changed
- Duplicating an existing mechanism (ghost, overlay, drag state) without first questioning whether to extend the existing one
- Translating friction directly into a build task without pausing to name the problem category and compare response paths (see Friction Checkpoint)
- Committing at asset-production or full-build level before a cheaper exploration step has validated the direction

---

## 9. Release Checklist

When shipping a version:

1. Bump version in `tauri.conf.json`, `package.json`, and `Cargo.toml` (all three must match)
2. Run `bun run tauri build` and confirm DMG produced
3. Test the DMG on target hardware
4. Append entry to `log.md`
5. Commit all changes
6. `git tag vX.X.X && git push origin vX.X.X`
7. GitHub Actions builds and creates a draft release automatically (Slice 15)
8. Review the draft release, publish

---

*Update this document when a new principle is discovered, a recurring mistake is resolved at its root, or a checklist item proves its worth.*
