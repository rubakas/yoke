# ADR-0008: Linting and Formatting Toolchain

**Status:** Accepted  
**Date:** 2026-09-01

## Decision

Adopt **ESLint v9 flat config + typescript-eslint (type-aware) + eslint-plugin-import-x + Prettier** as the project-wide linting and formatting toolchain.

## Context

The codebase is a modular TypeScript/ESM project with strict seam boundaries. We need:

- Consistent code style enforced automatically (no style debates in review)
- Correctness rules that catch real bugs at the type level (unhandled promises, bad imports)
- Enforcement of module boundaries to prevent accidental circular dependencies

## Toolchain

| Tool                     | Version | Role                                              |
| ------------------------ | ------- | ------------------------------------------------- |
| `eslint`                 | v10     | Linter engine (flat config, v9+ API)              |
| `@eslint/js`             | v10     | Base JS recommended ruleset                       |
| `typescript-eslint`      | v8      | Type-aware TS parser + rules                      |
| `eslint-plugin-import-x` | v4      | Import order and cycle detection                  |
| `prettier`               | v3      | Opinionated formatter                             |
| `eslint-config-prettier` | v10     | Disables ESLint rules that conflict with Prettier |

## Key Rules

**Errors (block CI):**

- `@typescript-eslint/consistent-type-imports` — type-only imports use `import type`, keeping runtime bundles clean
- `@typescript-eslint/no-floating-promises` — every promise must be awaited, `.catch`-ed, or explicitly `void`-ed; silently dropped promises are a common async bug
- `@typescript-eslint/no-misused-promises` — prevents passing async functions where sync callbacks are expected
- `@typescript-eslint/no-unused-vars` — unused variables (args after-used; `_`-prefixed names exempt)
- `import-x/no-cycle` — circular imports violate the module seam model (ADR-0002)

**Warnings:**

- `import-x/order` — consistent import group ordering (built-in → external → internal)
- `@typescript-eslint/no-explicit-any` — warns rather than errors to allow escape hatches

## Test-File Relaxations

`**/*.test.ts` files have `no-floating-promises` and `require-await` disabled: Node's built-in test runner handles the promises returned by `describe()`/`it()` internally, and test-double async methods with no `await` are idiomatic.

## Project Gate

**All three must pass before every push:**

```
pnpm lint          # 0 errors
tsc --noEmit       # type-clean
pnpm test          # all tests green
```

## Config Files

- `eslint.config.js` — ESLint v9 flat config (ESM, type-aware `projectService: true`)
- `.prettierrc` — 2-space indent, semicolons, double quotes, `trailingComma: "es5"`, `printWidth: 100`
- `.prettierignore` — excludes `dist/`, `node_modules/`, `drizzle/`, `pnpm-lock.yaml`

## Consequences

- CI must run `pnpm lint && tsc --noEmit && pnpm test` as a gate before merge
- New code must satisfy type-aware lint rules; `any` requires a justifying comment
- `import-x/no-cycle` enforces the seam-boundary discipline from ADR-0002 at the import graph level

The enforced pre-commit gate is `pnpm check` (lint + typecheck + format:check + test); run it before every commit to catch formatting drift that ESLint does not report (eslint-config-prettier disables all style rules).
