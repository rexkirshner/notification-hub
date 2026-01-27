# Decisions

Append-only log.

---

## 2026-01-26: [Infra] Install ACS v6.0.3 for session continuity
Why: Enable session loop pattern for context persistence across AI sessions
Tradeoff: Added 8 command files and context/ directory; minimal overhead
RevisitWhen: ACS releases major version update or if session continuity needs change

---

## 2026-01-26: [Infra] Report ACS installation friction to feedback API
Why: Commands not available mid-session after installation; documentation gaps identified
Tradeoff: None - feedback helps improve the tool for future users
RevisitWhen: ACS updates address the reported issues

---

## 2026-01-26: [Arch] Extract filter parsing to shared lib for RSC compatibility
Why: parseFiltersFromParams was in a "use client" file but called from server component, causing build failure
Tradeoff: Slightly more files; filter logic now in src/lib/filters.ts instead of co-located with component
RevisitWhen: Next.js changes server/client component boundaries or if filter logic grows complex
