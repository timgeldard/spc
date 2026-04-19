# SPC Testing Infrastructure

This repository contains a professional, enforceable test suite for the Statistical Process Control (SPC) application.

## Backend Tests (Python)

See [backend/tests/README.md](../backend/tests/README.md) for details.

### Setup
```bash
uv pip install -r requirements.txt -r requirements-dev.txt
```

### Running Tests
- `make test`: Run all unit tests (Enforces ≥75% coverage).
- `make test-stat`: Run statistical logic tests.
- `make test-dal`: Run SQL generation tests.

## Frontend Tests (React)

Located in `frontend/`.

### Setup
```bash
cd frontend && npm install
```

### Running Tests
- `npm test`: Run Vitest in watch mode.
- `npm run test:ci`: Run Vitest with coverage.

## Integration Tests

Located in `backend/tests/integration/`. These tests validate full SPC analysis and exclusion flows.

- `make test-integration`: Run integration suite (Requires Databricks configuration).

## Statistical Fidelity

All calculations are anchored to [docs/STATISTICAL_METHODS.md](../docs/STATISTICAL_METHODS.md) and validated against "golden datasets" in `backend/tests/fixtures/`.
