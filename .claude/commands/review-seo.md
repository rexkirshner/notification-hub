---
name: review-seo
description: SEO review of the codebase
---

# /review-seo

Perform an SEO review of the codebase.

## Scope

Review the files in the Working Set (from `context/STATUS.md`), or if specified, a particular file/directory. Focus on pages, templates, and routing.

### Scope Expansion

If the Working Set lacks SEO-relevant files, expand to include:
- `**/app/**/page.tsx`, `**/app/**/layout.tsx`
- `**/pages/**/*.tsx`, `**/pages/**/*.jsx`
- `**/components/**/Head*`, `**/components/**/Meta*`
- `**/public/robots.txt`, `**/public/sitemap*`
- `**/next.config.*`, `**/next-sitemap.config.*`

Consider running: Lighthouse SEO audit, Google Search Console, or Screaming Frog.

## What to Check

### Meta Tags
- **Missing/duplicate titles**: Pages without titles or same title across pages
- **Missing/weak descriptions**: No meta description or generic/duplicate text
- **No canonical URL**: Pages accessible at multiple URLs without canonical
- **Missing Open Graph**: No social preview tags (og:title, og:image, etc.)
- **Wrong robots directive**: Accidentally blocking indexing or following

### Structure & Markup
- **Broken heading hierarchy**: Skipped heading levels or missing h1
- **No structured data**: Missing JSON-LD for articles, products, FAQs, etc.
- **Non-semantic HTML**: Divs where semantic elements (article, nav) apply
- **No breadcrumbs**: Deep pages without navigation context for crawlers

### URLs & Routing
- **Ugly URLs**: Query strings, IDs, or encoded characters in URLs
- **Missing redirects**: Old URLs returning 404 instead of 301 redirect
- **Poor 404 handling**: No custom 404 page or broken links
- **Duplicate content**: Same content at multiple URLs without canonical

### Performance (SEO impact)
- **Poor Core Web Vitals**: LCP > 2.5s, FID > 100ms, CLS > 0.1
- **Unoptimized images**: Large images, missing width/height, no next-gen formats
- **No lazy loading**: Below-fold images loaded immediately
- **Render blocking**: CSS/JS blocking first contentful paint

### Content
- **Thin/duplicate pages**: Pages with little unique value or copied content
- **Poor content hierarchy**: Important content buried, no clear structure
- **Weak internal linking**: Orphan pages, no contextual links between content
- **Missing alt text**: Images without descriptive alt attributes

### Technical SEO
- **No sitemap**: Missing XML sitemap or not submitted to search console
- **Missing robots.txt**: No robots.txt or blocking important resources
- **No hreflang**: Multi-language site without language/region tags
- **Not mobile-friendly**: Layout breaks or content hidden on mobile
- **No HTTPS**: Site or resources loaded over insecure HTTP

## Output Format

```markdown
## SEO Review

### Critical Issues
- [Issue]: [Description and location]

### Important Issues
- [Issue]: [Description and location]

### Recommendations
- [Suggestion for improvement]

### Good Patterns Found
- [Pattern]: [Where it's used well]

### Checked Areas
- [List of what was reviewed]
```

## Behavior

1. Read STATUS.md to understand current context (if it doesn't exist, suggest running `/init-context` first or ask user to specify scope)
2. Review relevant files in Working Set (or specified scope)
3. Check against SEO criteria above
4. Produce report in specified format
5. Do NOT make changes - report only

## Done

Provide the SEO review report.
