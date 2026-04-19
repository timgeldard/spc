# SPC Testing Infrastructure

This repository contains a professional, enforceable test suite for the Statistical Process Control (SPC) application, covering both the Python backend and React frontend.

## Backend Tests (Python)

See [backend/tests/README.md](../backend/tests/README.md) for detailed instructions.

- **Tools**: `pytest`, `hypothesis`, `pytest-cov`, `requests-mock`
- **Coverage Goal**: ≥75% (Enforced in CI)
- **Philosophy**: Statistical fidelity first, fully mocked database calls.
- **Run**: `make test`

## Frontend Tests (React)

Located in the `frontend/` directory.

- **Tools**: `vitest`, `React Testing Library`, `@testing-library/jest-dom`
- **Coverage Goal**: ≥60% on critical paths.
- **Philosophy**: Component behavioral testing and hook logic validation.
- **Run**: `cd frontend && npm test`
- **CI Run**: `cd frontend && npm run test:ci` (includes coverage)

## Integration Tests

Located in `backend/tests/integration/`.

- **Philosophy**: End-to-end validation of the application stack against a test Databricks workspace.
- **Run**: `make test-integration` (Requires valid Databricks configuration/secrets)
- **CI**: Runs on the `main` branch or scheduled builds.

## Statistical Fidelity

Both backend and frontend calculations are anchored to [docs/STATISTICAL_METHODS.md](../docs/STATISTICAL_METHODS.md) and validated against "golden datasets" in `backend/tests/fixtures/`.
