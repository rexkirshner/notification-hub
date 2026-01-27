---
name: review-security
description: Security audit of the codebase
---

# /review-security

Perform a security review of the codebase.

## Scope

Review the files in the Working Set (from `context/STATUS.md`), or if specified, a particular file/directory.

### Scope Expansion

If the Working Set lacks security-relevant files, expand to include:
- `**/auth/**`, `**/api/**`, `**/middleware/**`
- `**/lib/auth*`, `**/lib/session*`, `**/lib/validation*`
- `**/*.config.*`, `**/env*`

Consider running: `npm audit` (or equivalent) to check dependencies.

## What to Check

### Authentication & Authorization
- **Unprotected routes**: Sensitive pages/APIs accessible without auth
- **Missing authorization**: Auth present but no role/permission check
- **Weak session management**: Long-lived sessions, no rotation on login
- **Insecure token storage**: JWTs in localStorage, tokens in URLs

### Input Validation
- **Unsanitized user input**: Raw input used in queries or output
- **SQL injection**: String concatenation in queries instead of parameterized
- **Command injection**: User input passed to shell commands
- **Path traversal**: User-controlled paths without validation (../)

### Data Protection
- **Secrets in logs**: Passwords, tokens, PII written to log output
- **Hardcoded secrets**: API keys, passwords in source code or config
- **Missing encryption**: Sensitive data stored or transmitted in plain text
- **Weak password handling**: Plain text storage, weak hashing (MD5, SHA1)

### API Security
- **No rate limiting**: Endpoints vulnerable to brute force or DoS
- **Permissive CORS**: Wildcard origins or credentials with broad access
- **Unvalidated input**: API accepts malformed or unexpected data
- **Verbose errors**: Stack traces or internal details exposed to clients

### Dependencies
- **Known CVEs**: Packages with published security vulnerabilities
- **Outdated packages**: Old versions missing security patches

### Common Vulnerabilities
- **XSS**: User content rendered without escaping (dangerouslySetInnerHTML)
- **CSRF**: State-changing requests without token validation
- **IDOR**: Direct object access without ownership verification
- **Misconfiguration**: Debug mode in prod, default credentials, open ports

## Output Format

```markdown
## Security Review

### Critical Issues
- [Issue]: [Description and location]

### Warnings
- [Issue]: [Description and location]

### Recommendations
- [Suggestion for improvement]

### Good Patterns Found
- [Security practice]: [Where it's used well]

### Checked Areas
- [List of what was reviewed]
```

## Behavior

1. Read STATUS.md to understand current context (if it doesn't exist, suggest running `/init-context` first or ask user to specify scope)
2. Review files in Working Set (or specified scope)
3. Check against security criteria above
4. Produce report in specified format
5. Do NOT make changes - report only

## Done

Provide the security review report.
