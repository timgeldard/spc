# CI Baselines

Baselines captured as part of the Phase 0 remediation workstream. CI gates reference these thresholds; update this file when a ratchet is intentional.

## Bundle budgets

Captured from `npm run build && npm run bundle:check` against the committed `frontend/dist/` snapshot on 2026-04-17.

| Asset | Current | Budget | Headroom |
|---|---|---|---|
| SPC shell entry (`SPCPage-*.js`) | 21.82 KB | 25 KB | 3.18 KB |
| Genie view wrapper (`GenieView-*.js`) | 6.88 KB | 10 KB | 3.12 KB |
| Control charts view (`ControlChartsView-*.js`) | 79.87 KB | 95 KB | 15.13 KB (post-Phase 1 adjustment) |
| Data quality panel (`DataQualityPanel-*.js`) | _new_ | 10 KB | measured after first rebuild |
| Carbon layout runtime | 19.12 KB | 30 KB | 10.88 KB |
| Carbon date runtime | 115.35 KB | 250 KB | 134.65 KB |
| Carbon flow icons | 5.23 KB | 80 KB | 74.77 KB |
| Carbon status icons | 6.82 KB | 80 KB | 73.18 KB |
| Carbon page icons | 1.13 KB | 60 KB | 58.87 KB |
| Carbon chart icons | 0.38 KB | 40 KB | 39.62 KB |
| Carbon table runtime | 44.35 KB | 60 KB | 15.65 KB |
| Carbon app runtime | 918.46 KB | 950 KB | 31.54 KB |
| Main stylesheet | 410.98 KB | 500 KB | 89.02 KB |

`ControlChartsView` carries the Shewhart/WECO/Nelson/EWMA/CUSUM/capability math via `calculations.runtime.ts`. Post-Phase 1 (autocorrelation + stability guard) and Phase 4.3 (data-quality wiring), the budget was raised from 80 KB to 95 KB with ~15 KB of headroom. **Phase 4.1 was reviewed and de-scoped**: splitting `calculations.runtime.ts` into separate chunks does not reduce the primary entry (which is already 21.8 KB) and would cost an extra network round-trip on first Charts-tab load for no user-visible win. MSA math is already in its own module (`msa/msaCalculations.ts`). If future additions approach the 95 KB budget, the designated relief work is splitting the *attribute chart* path (PChart/CChart/UChart/NPChart) into a separate lazy chunk since they can't be open simultaneously with variable charts.

## Backend coverage

Coverage reporting is now enforced in CI via `pytest --cov=backend --cov-fail-under=${COVERAGE_FAIL_UNDER}`. The floor is controlled by the repository variable `COVERAGE_FAIL_UNDER` (default `0`). Procedure:

1. Observe the first CI run that produces a coverage percentage.
2. Set the repository variable `COVERAGE_FAIL_UNDER` to the observed percentage minus 2 (safety margin for flakes).
3. Ratchet upward on each sustained improvement; never lower without explicit tech-lead sign-off.

## Deploy time

Captured from `make deploy PROFILE=<env>` once per quarter. Establish a stopwatch baseline on the next production deploy and record here:

| Run | Date | Duration |
|---|---|---|
| _initial_ | _TBD_ | _TBD_ |

## Gates enforced in CI (`.github/workflows/deploy.yml`)

- `tsc --noEmit` on both `tsconfig.app.json` and `tsconfig.node.json`
- `vitest run` (frontend unit tests)
- `vite build`
- `check-bundle-budgets.mjs`
- `pytest --cov=backend --cov-fail-under=${COVERAGE_FAIL_UNDER}`
- Coverage XML uploaded as artifact on every run

## One-time cleanup: remove `frontend/dist/` from git history

`frontend/dist/` is now listed in `.gitignore`, but the tree is still tracked.
Run the following in a dedicated commit (no other edits):

```bash
git rm -r --cached frontend/dist/
git commit -m "Remove frontend/dist/ from version control — build at deploy time"
```

After that:

- Local builds no longer clutter `git status`.
- Fresh clones still deploy correctly because `make deploy` runs `npm run build` (Makefile:48–49, 59) before `databricks bundle deploy`, which then uploads the freshly-built `frontend/dist/`. `.databricksignore` preserves this (it excludes source and config but not dist).
- PRs no longer contain minified JS diffs.

Verify by:
1. `git clone` the repo into a clean directory.
2. `make deploy PROFILE=<env>`.
3. Confirm the app renders normally.

## Gates deferred (out of Phase 0 scope)

- **ESLint / Prettier**: dependencies are not yet in `frontend/package.json`. Tracked as a follow-up; adding them requires a one-time cleanup pass.
- **Ruff / mypy**: backend has no linter/type-checker configuration today. Adding these requires an initial cleanup. Tracked as a follow-up.
- **Playwright E2E in CI**: tests exist at `frontend/e2e/` but require `npx playwright install` (adds ~150 MB and ~90 s to CI). Add once someone budgets the CI runtime cost.
- **Branch protection**: must be configured in GitHub repo settings — require `lint-and-test` status check on PRs to `main`. Manual step; cannot be automated from the repo.
