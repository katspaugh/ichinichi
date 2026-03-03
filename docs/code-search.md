# Code Search — ast-grep

`sg` (ast-grep) is installed. Use it for **structural** code searches — matching by AST shape rather than text. Prefer Grep/Glob for simple text/variable-name searches; use `sg` when you need pattern matching that understands syntax.

## When to Use

- Finding all call sites of a function with specific argument shapes
- Matching structural patterns (e.g., all `await $EXPR` inside a loop, all `useEffect` with empty deps)
- Refactoring: search-and-replace that respects syntax (rename, wrap, unwrap)
- Finding code patterns that text grep can't express (e.g., "any function that returns a Promise")

## When NOT to Use

- Simple text search (variable names, imports, strings) → use Grep
- File path patterns → use Glob
- These are faster and more straightforward for exact-match tasks

## Usage

```bash
# Find all calls to repository.get with any argument
sg -p 'repository.get($ARG)' -l typescript

# Find all useEffect hooks with empty dependency array
sg -p 'useEffect($FN, [])' -l tsx

# Find all await expressions inside async functions
sg -p 'await $EXPR' -l typescript

# Find all set() calls with status: "idle"
sg -p 'set({ status: "idle", $$$REST })' -l typescript

# Search-and-replace (dry run — prints diff)
sg -p 'console.log($$$ARGS)' -r 'logger.debug($$$ARGS)' -l typescript

# Restrict to specific paths
sg -p '$PATTERN' -l typescript src/stores/

# Run project diagnostic rules
sg scan
```

## Pattern Syntax

- `$VAR` — matches single AST node (expression, identifier, etc.)
- `$$$VAR` — matches zero or more nodes (spread/rest in patterns)
- Literal code matches itself structurally (ignoring whitespace/formatting)
- `-l` flag: use `typescript` for `.ts`, `tsx` for `.tsx` files

## Project Rules

Three diagnostic rules in `rules/`:
- `no-void-dispose-without-guard` — fire-and-forget dispose races with init
- `check-generation-after-await` — missing generation check after await
- `no-set-after-await-without-reread` — stale closure risk in Zustand stores

Run with `sg scan` (diagnostic, not blocking).
