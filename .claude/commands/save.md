---
name: save
description: End of session - updates STATUS.md, records decisions autonomously
---

# /save

Update context at end of session.

## Prerequisites

Verify these files exist:
- `context/STATUS.md`
- `context/DECISIONS.md`

If missing, suggest running `/init-context` first.

## Format Check

Before updating, verify `context/STATUS.md` is in v6.0 format.

**v6.0 format indicators (required):**
- Contains `SchemaVersion: 1`
- Has `## Working Set` section
- Has `## Next Actions` section

**v5.x format indicators (migration needed):**
- Contains `## Quick Reference`
- Contains `## Current Phase` or `## Work In Progress`
- Has URL fields, Tech Stack sections
- Missing `SchemaVersion`

**If v5.x format detected, stop and report:**

```
STATUS.md is in v5.x format and cannot be updated.

This project needs migration to v6.0. Download and run the migration script:

curl -O https://raw.githubusercontent.com/rexkirshner/ai-context-system/main/migrate-to-v6.sh
chmod +x migrate-to-v6.sh
./migrate-to-v6.sh

Do NOT run /update-context-system - that command is for v6.x to v6.y upgrades only.

See: https://github.com/rexkirshner/ai-context-system/blob/main/MIGRATIONS.md
```

Do NOT attempt to update a v5.x format file.

## What to Update

### context/STATUS.md

Update all fields while preserving the exact format:

```markdown
# Status

SchemaVersion: 1
LastUpdated: [today's date YYYY-MM-DD]
HeadCommit: [run: git rev-parse --short HEAD, or keep existing value if not a git repo]
Objective: [current goal - update if changed during session]

## Working Set

- [3-7 files/directories being touched]
- [Add any new paths worked on this session]
- [Remove paths no longer relevant]

## Next Actions

- [Concrete next steps based on session progress]
- [What should the next session pick up?]

## Blocked On

- [Any blockers, or "(None)" if clear]
```

**Field guidance:**
- **LastUpdated**: Always today's date
- **HeadCommit**: Current git SHA (run `git rev-parse --short HEAD`); if not a git repo, keep existing value
- **Objective**: Update if focus shifted during session
- **Working Set**: 3-7 items, reflect what was actually touched
- **Next Actions**: Actionable items for next session
- **Blocked On**: External dependencies, questions, or "(None)"

**Note:** STATUS.md captures current state only and is **replaced** each session—it is not a log. Session history is preserved in git commits. For context that should persist across sessions (architectural decisions, tradeoffs, rationale), add entries to DECISIONS.md.

### context/DECISIONS.md (if applicable)

Autonomously determine if any decisions from this session should be recorded. You have full session context—use your judgment.

**Record a decision if it:**
- Explains why something is implemented a certain way
- Involves tradeoffs that future developers might question
- Affects how future work should be approached

If a decision is worth recording, append a new entry:

```markdown
---

## YYYY-MM-DD: [Area] Decision Title
Why: [reason for the decision]
Tradeoff: [what we gave up or risk we accepted]
RevisitWhen: [trigger condition to reconsider]
```

Replace `YYYY-MM-DD` with today's actual date (e.g., 2026-01-24).

**Area prefixes** (for grep-ability—choose the most relevant area):
- [DB], [API], [UI], [Auth], [Infra], [Deps], [Arch], [Test], [Perf], etc.
- Use the area most affected by the decision, or [Arch] for cross-cutting choices

**Mixed formats:** If DECISIONS.md contains older v5.x entries (Context/Decision/Rationale/Alternatives), always append new entries in v6.0 format. Old entries remain valid and readable; no migration needed.

## Behavior

1. Read current STATUS.md
2. Check for v5.x format — if detected, stop with migration instructions
3. Update all fields based on session work
4. Write updated STATUS.md (preserve exact format)
5. Evaluate session for recordable decisions (autonomously, do not ask)
6. If decision worth recording, append to DECISIONS.md
7. Report what was updated

## Done

Report:
- "Updated STATUS.md" with summary of changes
- "Added decision: [title]" if applicable, or "No new decisions"
