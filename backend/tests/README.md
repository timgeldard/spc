# SPC Application Testing

This directory contains the backend test suite for the Statistical Process Control (SPC) application.

## Testing Philosophy

1.  **Statistical Fidelity First**: Core statistical calculations (control limits, Nelson rules, capability indices) are the most critical parts of the application. They are tested against "golden datasets" derived from AIAG and WECO standards.
2.  **Push Statistics to SQL**: We prioritize testing the SQL generation logic in the DAL layer to ensure governed calculations are correctly offloaded to Databricks.
3.  **Isolation**: Unit tests should never require a live connection to Databricks. All database interactions are mocked.
4.  **Property-Based Testing**: We use `hypothesis` to ensure statistical utilities handle edge cases (empty data, constant data, NaN) gracefully.

## Running Tests

### Prerequisites

Ensure you have `uv` installed and the virtual environment set up.

```bash
make test
```

### Specific Test Suites

- **Statistical Tests**: `make test-stat`
- **Data Access Layer (DAL) Tests**: `make test-dal`
- **Coverage Report**: `make coverage`

## "Acceptable Production Level" Goals

- **Core statistical utils**: 90%+ coverage.
- **DAL / PyPika SQL builders**: 80%+ coverage.
- **FastAPI routers & schemas**: 70%+ coverage.
- **Overall**: >75% backend coverage enforced in CI.

## References

Tests in this suite are mapped to the mathematical definitions in [docs/STATISTICAL_METHODS.md](../docs/STATISTICAL_METHODS.md).
