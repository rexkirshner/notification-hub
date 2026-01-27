---
name: review-cost
description: Cost optimization review of the codebase
---

# /review-cost

Perform a cost optimization review of the codebase.

## Scope

Review the files in the Working Set (from `context/STATUS.md`), or if specified, a particular file/directory.

### Scope Expansion

If the Working Set lacks infrastructure files, expand to include:
- `**/vercel.json`, `**/netlify.toml`, `**/serverless.*`
- `**/prisma/**`, `**/drizzle/**`, `**/*database*`
- `**/next.config.*`, `**/vite.config.*`
- `**/package.json` (for dependency costs)
- `**/api/**` routes (for API call patterns)

Consider running: Cloud provider cost dashboards, database query analyzers, or bundle size analyzers.

## What to Check

Skip sections that don't apply to your deployment model.

### Serverless & Edge Platforms (Vercel, Netlify, Cloudflare)
- **Rendering strategy**: SSR on every request vs ISR/SSG (static is free, SSR costs per invocation)
- **Edge vs Serverless runtime**: Edge is cheaper but has limitations
- **Function duration**: Long-running functions cost more—optimize or move to background jobs
- **Function memory**: Over-allocated memory increases cost per invocation
- **Cold starts**: Patterns that prevent warm instances (too many routes, large bundles)
- **Image optimization**: Excessive transformations (Vercel charges per optimization)
- **Build minutes**: Slow builds consume CI/CD budget
- **Bandwidth**: Large responses, missing compression, unoptimized assets

### Database & ORM (Prisma, Drizzle, etc.)
- **N+1 queries**: The #1 cost multiplier—use `include`/`select` or dataloaders
- **Connection pooling**: Missing pooling exhausts connections (use PgBouncer or Prisma Accelerate)
- **Query efficiency**: Fetching unused fields, missing pagination, full table scans
- **Transaction overuse**: Wrapping reads in transactions unnecessarily
- **Over-provisioned tiers**: Database tier larger than needed
- **Read replicas**: Not using replicas for read-heavy workloads

### API Usage
- **Unnecessary calls**: Calling paid APIs when cached data would suffice
- **Missing response caching**: Repeated identical requests
- **No batching**: Multiple calls where one batch call would work
- **Retry costs**: Rate limit retries without backoff
- **Tier mismatch**: Paying for higher tier than needed

### Caching
- **Missing cache layers**: Repeated expensive operations that could be cached
- **Invalidation overhead**: Over-aggressive invalidation causing cache misses
- **Wrong cache type**: In-memory when distributed needed, or vice versa
- **TTL tuning**: Too short (wasted recomputation) or too long (stale data)

### Code Patterns
- **Polling vs webhooks**: Polling wastes requests; webhooks are event-driven
- **Sync vs async**: Blocking on expensive operations wastes function time
- **Retry storms**: Exponential backoff missing, causing cascade failures
- **Missing circuit breakers**: Failed services hammered repeatedly

### Traditional Infrastructure (VMs, Containers, Kubernetes)
Skip this section for serverless deployments.
- **Over-provisioned instances**: More CPU/RAM than workload needs
- **Zombie resources**: Unused instances, volumes, or IPs still incurring costs
- **Reserved capacity**: On-demand pricing when reserved would save money
- **Region costs**: Running in expensive regions without need
- **Auto-scaling gaps**: Not scaling down during low traffic

### Storage
- **Uncompressed assets**: Large files that could be gzipped/brotli
- **Unused assets**: Old uploads, orphaned files still consuming storage
- **Missing CDN**: Static assets served from origin instead of edge
- **Wrong storage tier**: Hot storage for cold data, or vice versa
- **Duplicate data**: Same content stored multiple times

### Third-Party Services
- **Unused features**: Paying for features not being used
- **Over-tiered**: On a higher plan than usage warrants
- **Cheaper alternatives**: Equivalent services at lower cost
- **License waste**: Unused seats or over-provisioned licenses

## Output Format

```markdown
## Cost Optimization Review

### High Impact Opportunities
- [Issue]: [Description, location, and estimated savings potential]

### Medium Impact Opportunities
- [Issue]: [Description and location]

### Low-Hanging Fruit
- [Quick wins that are easy to implement]

### Already Optimized
- [Good patterns found]

### Checked Areas
- [List of what was reviewed]

### Recommended Next Steps
- [Prioritized actions]
```

## Behavior

1. Read STATUS.md to understand current context (if it doesn't exist, suggest running `/init-context` first or ask user to specify scope)
2. Review files in Working Set (or specified scope)
3. Check against cost optimization criteria above
4. Produce report in specified format
5. Do NOT make changes - report only

## Done

Provide the cost optimization review report.
