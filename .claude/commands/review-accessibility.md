---
name: review-accessibility
description: Accessibility review of the codebase
---

# /review-accessibility

Perform an accessibility (a11y) review of the codebase.

## Scope

Review the files in the Working Set (from `context/STATUS.md`), or if specified, a particular file/directory. Focus on UI components and templates.

### Scope Expansion

If the Working Set lacks UI files, expand to include:
- `**/components/**/*.tsx`, `**/components/**/*.jsx`
- `**/app/**/page.tsx`, `**/app/**/layout.tsx`
- `**/pages/**/*.tsx`, `**/pages/**/*.jsx`
- `**/*.css`, `**/*.scss`, `**/styles/**`

Consider running: Lighthouse accessibility audit, axe-core, or pa11y.

## What to Check

### Semantic HTML
- **Heading hierarchy**: Skipped levels (h1 → h3) or multiple h1s per page
- **Missing landmarks**: Using div where nav, main, article, section applies
- **Non-semantic lists**: Related items not wrapped in ul/ol
- **Layout tables**: Using tables for layout instead of CSS grid/flex

### ARIA & Roles
- **Missing labels**: Interactive elements without accessible names
- **Incorrect roles**: Wrong role for element type (button with role="link")
- **No live regions**: Dynamic content updates not announced to screen readers
- **Missing states**: Expandable/selectable elements without aria-expanded/selected

### Keyboard Navigation
- **Unfocusable elements**: Clickable divs/spans without tabindex
- **Illogical focus order**: Tab order doesn't match visual layout
- **Invisible focus**: Focus indicator removed or hard to see
- **No skip links**: Long navigation with no way to skip to main content

### Forms
- **Unlabeled inputs**: Inputs without associated label elements
- **Inaccessible errors**: Error messages not linked to inputs or announced
- **Unclear required fields**: Required fields not indicated to screen readers
- **Missing autocomplete**: No autocomplete on common fields (name, email, etc.)

### Images & Media
- **Missing alt text**: Images without alt attribute or meaningful description
- **Decorative not marked**: Decorative images missing alt="" or role="presentation"
- **No captions**: Videos without closed captions or transcripts
- **No audio descriptions**: Complex visuals not described for blind users

### Color & Contrast
- **Low contrast**: Text/background combinations below 4.5:1 (AA) ratio
- **Color-only information**: Status indicated only by color (red/green)
- **Focus invisible**: Focus ring same color as background or too subtle

### Motion & Timing
- **No reduced motion**: Animations ignore prefers-reduced-motion
- **Auto-play media**: Video/audio starts without user action
- **Time limits**: Timed interactions without extension options

## Output Format

```markdown
## Accessibility Review

### Critical Issues (WCAG A)
- [Issue]: [Description and location]

### Important Issues (WCAG AA)
- [Issue]: [Description and location]

### Recommendations (WCAG AAA / Best Practice)
- [Suggestion for improvement]

### Good Patterns Found
- [Pattern]: [Where it's used well]

### Checked Areas
- [List of what was reviewed]
```

## Behavior

1. Read STATUS.md to understand current context (if it doesn't exist, suggest running `/init-context` first or ask user to specify scope)
2. Review UI files in Working Set (or specified scope)
3. Check against accessibility criteria above
4. Produce report in specified format
5. Do NOT make changes - report only

## Done

Provide the accessibility review report.
