# Code Review Instructions

Review the changes in this pull request (PR) for correctness, security, and performance. Report findings with a severity level.

## Scope

- **Focus on the code, not on the tests!** Do NOT review unit tests, test fixtures, or test helpers. Only report a test issue if it hides a real P0 / P1 bug in the code under test.
- Do NOT review version bumps, lockfiles, generated files, README updates, or renamed files, unless they break the build or introduce a security risk.
- Only review the changes in this PR. Do NOT report existing issues in unchanged code, unless the PR makes them redundant or incorrect.

## No Nitpicking

Every comment must point to a real problem with a real impact. Do NOT comment on:

- Code style, formatting, or import order. Prettier and linters handle that.
- Naming preferences, unless the name is actively misleading.
- Missing comments, docstrings, or type annotations.
- Alternative implementations that are not clearly better.
- Small refactors, "DRY" improvements, or abstractions for code that works and is readable.
- Hypothetical future requirements.

**Edge cases come last, if at all!** If a codepath has less than 1% chance of being hit, and it cannot cause a P0 / P1 event, do not report it. If you are unsure whether a comment is a nitpick, it is a nitpick. A review with zero comments is a valid review.

## Review Checklist

### Correctness

- Logic is sound and does what the PR intends.
- No obvious bugs, regressions, or broken contracts with callers.
- No race conditions or incorrect `async` / `await` usage (missing `await`, async callbacks in `forEach`, unhandled promise rejections).
- Breaking changes have a migration path, and are documented in the PR description.

### Silent Failures

- Empty or log-only `catch` blocks that hide failures from the caller or the user.
- `catch` blocks that return `null` or a default value where the caller expects success.
- Fallbacks that mask missing data (`a || b || DEFAULT`) where the missing value is actually a bug.

### Security (OWASP Top 10)

- No injection vulnerabilities (SQL, XSS, command, path traversal).
- Authentication and authorization are enforced on new routes and actions.
- User input is validated at system boundaries.
- No hardcoded secrets or credentials. No sensitive data in logs or responses.

### Performance

- No N+1 queries, or repeated expensive calls inside loops.
- No unbounded memory growth, leaked listeners, timers, or connections.
- External calls have timeouts and sane error handling.

### Data Safety

- No data loss risks: destructive operations, migrations, and deletions are safe and reversible where possible.

## Verify Before You Comment

- **Read the full file, not only the diff.** A bug might not be a bug if the input can only come from a trusted dependency or an earlier validation step.
- **Check before you claim.** Search the codebase before you say "this project uses pattern X" or "this function is never called". Quote the evidence.
- **Check the dependencies.** If the diff adds imports, confirm the package exists in `package.json` (or equivalent).
- If you cannot verify a finding, mark it as a question. Do NOT state it as a fact.

## Severity Levels

Use these levels for all findings. Always explain the impact in one sentence.

- **P0 - Blocker:** Security vulnerabilities, data loss, crashes in common codepaths, or broken builds. Must be fixed before merge.
- **P1 - Major:** Bugs with a real user impact, silent failures on critical paths, serious performance issues, or undocumented breaking changes. Should be fixed before merge.
- **P2 - Minor:** Real issues with a low impact. Report only if the review is not already dense. Never more than 3 P2 findings per review.

Anything below P2 is a nitpick. Do not report it.

## Comment Style

- Be direct and brief. One issue per comment.
- Explain WHY it is a problem, not only WHAT is wrong.
- Reference the exact location: `file.ts:45-50`.
- Suggest a concrete fix when it is not obvious.
- Do not repeat the same finding on multiple lines. Comment once and list the other locations.
- Do not praise the code or summarize what the PR does. The author already knows.

## Output Format

```markdown
## Summary

[1-2 sentences: overall assessment and merge recommendation.]

## P0 - Blockers

1. **[Issue title]** - `file.ts:45-50`
   - **Impact:** [What breaks, and for whom.]
   - **Fix:** [Concrete suggestion.]

## P1 - Major

[Same structure as P0.]

## P2 - Minor

[Same structure as P0.]

## Questions

- [Findings that could not be verified, phrased as questions to the author.]
```

Omit any section that has no findings. If there are no findings at all, reply with only the summary.
