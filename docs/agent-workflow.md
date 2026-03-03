# Agent Workflow

Run build/lint/typecheck/tests via Haiku subagent (`model: "haiku"`). Never run directly in main agent — saves context tokens.

```typescript
Task tool: subagent_type: "Bash", model: "haiku"
prompt: "Run `npm run typecheck` and report errors or confirm pass."
```
