---
name: update-context-system
description: Updates context system from v6.x to v6.y (NOT for pre-v6 migrations)
---

# /update-context-system

Update the AI Context System from v6.x to a newer v6.y version.

**This command is for v6.x → v6.y upgrades only.** For pre-v6 migrations, use the `migrate-to-v6.sh` script.

## Steps

### 1. Check for Pre-v6 Installation

Before proceeding, verify this is a v6.0+ project.

**Pre-v6 indicators (any of these):**
- `scripts/` directory exists
- `.claude/agents/` directory exists
- `context/SESSIONS.md` exists
- STATUS.md contains `## Quick Reference` or `## Current Phase`
- No `.claude/VERSION` file AND any v5.x artifacts present

**If pre-v6 detected, stop and report:**

```
This project is on a pre-v6 version.

/update-context-system is for v6.x to v6.y upgrades only.

For pre-v6 to v6.0 migration, download and run the migration script:

curl -O https://raw.githubusercontent.com/rexkirshner/ai-context-system/main/migrate-to-v6.sh
chmod +x migrate-to-v6.sh
./migrate-to-v6.sh

See: https://github.com/rexkirshner/ai-context-system/blob/main/MIGRATIONS.md
```

Do NOT proceed with update.

### 2. Check Current Version

Read `.claude/VERSION` to get the current installed version (e.g., "6.0.1").

### 3. Get Latest Version

Clone the repository:

```bash
git clone --depth 1 https://github.com/rexkirshner/ai-context-system.git /tmp/acs-update
```

Read the version from `/tmp/acs-update/.claude/VERSION`.

### 4. Compare Versions

Compare as semantic version strings (e.g., "6.0.1" vs "6.0.2").

**If current version equals latest version:**
- Report "Already up to date (v[version])"
- Clean up: `rm -rf /tmp/acs-update`
- Exit

**If current version is higher than latest:**
- Warn user (possible downgrade)
- Ask if they want to proceed

### 5. Copy New Command Files

```bash
rm -rf .claude/commands/
cp -r /tmp/acs-update/.claude/commands/ .claude/commands/
cp /tmp/acs-update/.claude/VERSION .claude/VERSION
```

### 6. Cleanup

```bash
# Remove temp clone
rm -rf /tmp/acs-update

# Remove legacy backup files from previous versions
rm -rf .claude/commands-backup-*/
rm -f .claude/VERSION.backup-*
rm -rf .claude-backup-*/
```

### 7. Verify

Run these checks:
- `ls .claude/commands/` — Should have 8 command files (*.md)
- `cat .claude/VERSION` — Should show new version

## Error Handling

- **Git clone fails**: Check network connection, suggest trying again later
- **Permission denied**: Check write permissions on .claude/ directory

If any step fails, clean up `/tmp/acs-update` before exiting.

## Rollback

If update fails and user wants to restore, use git:

```bash
git checkout .claude/commands/ .claude/VERSION
```

**Note:** This assumes `.claude/` is committed to your repository. If not, commit it before running updates.

## Done

Report:
- Previous version
- New version
- "Commands updated successfully"
