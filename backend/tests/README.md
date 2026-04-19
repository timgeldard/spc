# SPC Application Testing

This repository contains a professional, enforceable test suite for the Statistical Process Control (SPC) application.

## Testing Philosophy

1.  **Statistical Fidelity First**: Core statistical calculations (control limits, Nelson rules, capability indices) are anchored to [docs/STATISTICAL_METHODS.md](../docs/STATISTICAL_METHODS.md) and validated against "golden datasets".
2.  **Push Statistics to SQL**: We prioritize testing the SQL generation logic in the DAL layer to ensure governed calculations are correctly offloaded to Databricks.
3.  **Isolation**: Unit tests are fully mocked and do not require a live Databricks connection.
4.  **Property-Based Testing**: `hypothesis` is used to ensure statistical robustness against edge cases.

## Getting Started

### Install Dependencies

We use `uv` for lightning-fast dependency management.

```bash
uv pip install -r requirements.txt -r requirements-dev.txt
```

### Running Tests

Use the `Makefile` targets for standard operations:

- **Run all tests**: `make test` (Enforces ≥75% coverage)
- **Statistical focus**: `make test-stat`
- **DAL focus**: `make test-dal`
- **Fast run**: `make test-quick`
- **HTML Coverage**: `make coverage`

## "Acceptable Production Level" Goals

- **Coverage**: ≥75% backend coverage enforced in CI.
- **Mocking**: All DAL tests must use `pytest-mock` for the SQL executor.
- **Golden Data**: Fixtures in `backend/tests/fixtures/` must be used for behavioral validation.
