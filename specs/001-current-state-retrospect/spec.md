# Feature Specification: SPC Application Current State (Retrospect)

**Feature Branch**: `001-current-state-retrospect`  
**Created**: 2026-04-19  
**Status**: Baslined (Current State)
**Input**: Reverse-engineered from codebase as of 2026-04-19

## Overview

This specification documents the current functional and technical state of the SPC Application. It serves as the baseline for future development and quality assurance.

## User Scenarios & Testing

### User Story 1 - Statistical Process Control (Priority: P1)

As a Quality Engineer, I can visualize process variation through control charts and capability scorecards to ensure production stability and specification compliance.

**Independent Test**: Verify that a material with mixed normality correctly displays "Governed" capability indices that respect the normality classification (Gaussian vs Non-Parametric).

**Acceptance Scenarios**:

1. **Given** a normal distribution, **When** capability is calculated, **Then** Cp/Cpk and Pp/Ppk currently use the same population standard deviation ($\sigma_{overall}$), making them mathematically identical in the scorecard.
2. **Given** a non-normal distribution, **When** capability is calculated, **Then** the system falls back to empirical percentile-based calculation (ISO 22514-2).
3. **Given** 14 alternating points, **When** Nelson Rules are detected, **Then** Rule 4 currently only triggers if the sequence begins with an upward step (phase bias).

---

### User Story 2 - Measurement System Analysis (Priority: P1)

As a Quality Engineer, I can perform Gauge R&R studies (Average & Range or ANOVA) to validate the precision of measurement equipment.

**Current Reality (Technical Debt)**: As of `QUALITY_REVIEW_2026-04-03`, results are systematically incorrect due to division by $d_2^*$ constants instead of multiplication by AIAG K-factors.

**Independent Test**: Provide AIAG 4th Edition reference data and verify results match published ground-truth values. (Note: Currently expected to fail until fix).

---

### User Story 3 - Data Governance & Exclusions (Priority: P1)

As a Lead Engineer, I can exclude outliers with persistent justifications to maintain a defensible quality audit trail.

**Acceptance Scenarios**:

1. **Given** an excluded point, **When** viewing the audit log, **Then** the user, timestamp, and justification are visible and immutable.
2. **Given** multiple users, **When** accessing the process flow, **Then** cached data is currently NOT isolated per user (Process-flow Cache Leak), potentially allowing cross-user data exposure.

---

## Functional Requirements

- **FR-001**: System MUST compute within-subgroup variation for individuals using a moving range of 2. (Current implementation uses overall sigma for scorecard aggregation).
- **FR-002**: System MUST compute process performance using sample standard deviation (denominator N-1). (Current implementation uses population denominator N).
- **FR-003**: System MUST automatically infer specification types (Bilateral, Unilateral Upper/Lower, or Asymmetric) from master data. (Current implementation in `backend/dal/spc_shared.py::infer_spec_type` handles this logic, but there is missing integration with the scorecard path which does not consistently propagate/apply these inferred types).
- **FR-004**: System MUST perform Shapiro-Wilk normality testing to determine the appropriate capability model.
- **FR-005**: System MUST provide an interactive Process Flow DAG with lineage-depth controls (1-12 levels).
- **FR-006**: System MUST persist exclusions and justifications in a backend Delta table with Change Data Feed enabled.

## Success Criteria

- **SC-001**: 100% parity between backend and frontend statistical implementations.
- **SC-002**: Zero cross-user data leakage in the caching layer. (Currently failing).
- **SC-003**: Sub-200ms response time for primary analytical endpoints (Scorecard, Process Flow) when cached.

## Assumptions

- **Subgroup Size**: Default subgroup size is 1 (Individuals) unless subgroup identifiers are present.
- **Data Freshness**: System assumes 5-minute TTL for metadata caching and 3-minute TTL for analytical chart data.
- **Security**: Relies on `x-forwarded-access-token` for per-user OIDC passthrough to Unity Catalog.
