---
name: init-context
description: Creates CLAUDE.md, context/STATUS.md, and context/DECISIONS.md if they don't exist
---

# /init-context

Initialize context files for a project. Safe to run - never overwrites existing files.

## What to Create

### 1. CLAUDE.md (in project root)

If CLAUDE.md doesn't exist, create it:

```markdown
> **Session Loop**
> 1. Start → Read `context/STATUS.md`
> 2. End → Run `/save`

# [Project Name]

[One paragraph: what this is, what it does.]

## Commands

Run: `[command]`
Test: `[command]`
Build: `[command]`

## Constraints

- Don't refactor unrelated code
- Keep PRs under 300 lines
- If you need to touch files outside Working Set, pause, propose, update Working Set, then proceed

## Context

- Status: `context/STATUS.md`
- Decisions: `context/DECISIONS.md`

## Notes

- [Project-specific conventions]
```

**Detecting project info:**
1. Check `package.json` for `name` field → use as project name
2. Check `README.md` for title (first `#` heading) → use as project name
3. If neither exists, use the directory name or ask the user

Fill in bracketed sections by reading:
- `package.json` scripts for run/test/build commands
- `Makefile`, `build.gradle`, `Cargo.toml`, etc. for build commands
- `README.md` for project description

### 2. context/STATUS.md

If context/STATUS.md doesn't exist:
1. Create the context directory: `mkdir -p context/`
2. Create the file with this content:

```markdown
# Status

SchemaVersion: 1
LastUpdated: [today's date YYYY-MM-DD]
HeadCommit: [run: git rev-parse --short HEAD, or "N/A" if not a git repo]
Objective: [ask user or leave as "TBD"]

## Working Set

- [3-7 files/directories to start with, or "TBD"]

## Next Actions

- [Initial next steps, or "TBD"]

## Blocked On

- (None)
```

### 3. context/DECISIONS.md

If context/DECISIONS.md doesn't exist, create it:

```markdown
# Decisions

Append-only log.

---
```

## Behavior

1. Check which files exist (CLAUDE.md, context/STATUS.md, context/DECISIONS.md)
2. Create `context/` directory if it doesn't exist
3. Only create missing files (never overwrite)
4. For existing files, report "Already exists: [filename]"
5. For created files, report "Created: [filename]"
6. If CLAUDE.md is created, ask user to review and customize it
7. If not a git repo, use "N/A" for HeadCommit
8. **If CLAUDE.md already exists**, check if it contains the Session Loop block (look for "Session Loop" or "Read `context/STATUS.md`"). If not found, display the following message:

   > **Important:** Your existing CLAUDE.md doesn't include the Session Loop — the core pattern that enables context persistence. Add this block to the top of your CLAUDE.md:
   >
   > ```markdown
   > > **Session Loop**
   > > 1. Start → Read `context/STATUS.md`
   > > 2. End → Run `/save`
   > ```
   >
   > This tells future AI sessions how to use the context system.

## Done

Report what was created vs already existed.
