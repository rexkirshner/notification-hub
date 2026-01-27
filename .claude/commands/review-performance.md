---
name: review-performance
description: Performance review of the codebase
---

# /review-performance

Perform a performance review of the codebase.

## Scope

Review the files in the Working Set (from `context/STATUS.md`), or if specified, a particular file/directory.

### Scope Expansion

If the Working Set lacks performance-critical files, expand to include:
- `**/api/**`, `**/lib/**`, `**/utils/**`
- `**/components/**` (for render performance)
- `**/prisma/**`, `**/*database*` (for query patterns)
- `**/next.config.*`, `**/vite.config.*` (for build config)

Consider running: Bundle analyzer, React DevTools Profiler, or Lighthouse performance audit.

## What to Check

### Database & Queries
- **N+1 queries**: Loops making individual queries instead of batch/join
- **Missing indexes**: Slow queries on frequently-filtered columns
- **Inefficient queries**: SELECT * when only few fields needed, missing LIMIT
- **Connection pooling**: New connections per request instead of pool reuse

### Memory & Resources
- **Memory leaks**: Event listeners not removed, closures holding references
- **Large allocations**: Creating big arrays/objects in hot paths
- **Resource cleanup**: Streams, file handles, connections not closed
- **Missing caching**: Recomputing expensive results that could be memoized

### Algorithms & Data Structures
- **O(n²) algorithms**: Nested loops when O(n) or O(n log n) possible
- **Wrong data structure**: Array lookups when Map/Set would be O(1)
- **Unnecessary iterations**: Multiple passes when one would suffice
- **Redundant computation**: Same calculation repeated without caching

### Network & I/O
- **Unnecessary API calls**: Fetching data already available locally
- **No request batching**: Multiple round-trips when one batch call works
- **Large payloads**: Sending more data than client needs
- **Blocking I/O**: Synchronous file/network ops in hot paths

### Frontend (if applicable)
- **Bundle size**: Large dependencies, missing code splitting
- **Render performance**: Expensive computations during render
- **Unnecessary re-renders**: Missing memo, unstable references in props
- **Unoptimized images**: Large images, missing lazy loading, no srcset

### Async & Concurrency
- **Blocking operations**: Sync code where async would prevent blocking
- **Sequential when parallel**: Awaiting independent operations one by one
- **Race conditions**: Shared state modified without synchronization
- **Deadlock potential**: Circular waits on locks or resources

## Output Format

```markdown
## Performance Review

### Critical Issues
- [Issue]: [Description, location, and impact]

### Optimization Opportunities
- [Area]: [Suggestion and expected benefit]

### Good Patterns Found
- [Pattern]: [Where it's used well]

### Checked Areas
- [List of what was reviewed]
```

## Behavior

1. Read STATUS.md to understand current context (if it doesn't exist, suggest running `/init-context` first or ask user to specify scope)
2. Review files in Working Set (or specified scope)
3. Check against performance criteria above
4. Produce report in specified format
5. Do NOT make changes - report only

## Done

Provide the performance review report.
