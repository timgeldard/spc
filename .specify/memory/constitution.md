# SPC-TIM Constitution

## Core Principles

### I. Statistical Fidelity First
The primary value of this application is statistical accuracy for quality decisions. 
- **Strict Statistical Correctness**: All future refactors must mandate **Sample Standard Deviation** ($N-1$ denominator) for process performance indices ($P_p, P_{pk}$) and **Within-Subgroup Sigma** (estimated from $R/d_2$ or pooled variance) for process capability indices ($C_p, C_{pk}$).
- **Formula Alignment**: All implemented formulas must match [docs/STATISTICAL_METHODS.md](../../docs/STATISTICAL_METHODS.md) without deviation.

### II. Native Databricks Security
The app must not replicate filtering logic that Databricks Unity Catalog already provides.
- **User-Scoped Caching**: All analytical caches (including process-flow and scorecard) MUST be keyed by the user's OIDC `sub` or email claim to prevent cross-user data leakage.
- **Token Passthrough**: Authentication MUST always use the `x-forwarded-access-token` provided by the Databricks Apps runtime.

### III. SAP QM Semantic Integrity
Calculations must respect the semantics of the source data (SAP QM/PP-PI).
- **Specification Context**: Specification types (bilateral, unilateral) must be correctly inferred from the data; hardcoded bilateral stubs are prohibited.
- **Unit of Measure (UoM) Awareness**: SPC results across different plants are only valid if units are consistent; future implementations should include explicit normalization or warnings.

## Security Requirements

- **Rate Limiting**: Client identity for rate limiting must be based on user identity (token hash) or `x-forwarded-for`, never the proxy IP address alone.
- **Data Isolation**: Caching must be strictly isolated per user session.

## Performance Standards

- **Push Statistics to SQL**: Heavy analytical logic should be implemented in Databricks SQL or Materialized Views to leverage the warehouse's compute.
- **Latency**: Primary analytical screens should load within 2 seconds.

## Governance

- **Statistical Validation**: Any change to calculation logic requires validation against AIAG/WECO ground-truth datasets.
- **Regression Testing**: Unit tests must cover all 8 Nelson/WECO rules.

**Version**: 2.0.0 | **Ratified**: 2026-04-19 | **Last Amended**: 2026-04-19
