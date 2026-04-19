# Feature Specification: Statistical Correctness & Security Hardening

**Feature Branch**: `001-stat-correctness-fix`  
**Created**: 2026-04-19  
**Status**: Draft  
**Input**: User description: "--retrospect"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accurate MSA Analysis (Priority: P1)

As a Quality Engineer, I need MSA (Measurement System Analysis) calculations to be mathematically correct according to AIAG standards so that I can trust the Gauge R&R results when validating measurement equipment.

**Why this priority**: Incorrect MSA results can lead to accepting a faulty measurement system or rejecting a capable one, directly impacting product quality decisions.

**Independent Test**: Can be fully tested by providing a standard reference dataset (e.g., from AIAG MSA 4th Edition Appendix) and verifying that the calculated EV, AV, PV, and %GRR match the reference values exactly.

**Acceptance Scenarios**:

1. **Given** a standard MSA study dataset, **When** the Gauge R&R analysis is performed, **Then** EV (Repeatability) is calculated using `R̄_bar * K1` (multiplication).
2. **Given** a standard MSA study dataset, **When** the Gauge R&R analysis is performed, **Then** PV (Part Variation) is calculated using `R_parts * K3` (multiplication).
3. **Given** a standard MSA study dataset, **When** the Gauge R&R analysis is performed, **Then** AV (Appraisability) formula correctly accounts for the K2 constant multiplication.

---

### User Story 2 - Correct Capability Differentiation (Priority: P1)

As a Quality Manager, I need the Scorecard to display distinct values for Potential Capability (Cp/Cpk) and Process Performance (Pp/Ppk) so that I can distinguish between the "best" the process can do and its actual historical performance.

**Why this priority**: Currently, these indices are mathematically collapsed, making the distinction between "within-sigma" and "overall-sigma" invisible to the user.

**Independent Test**: Can be tested by verifying that on a dataset with significant between-subgroup variation, the Cp/Cpk values differ from Pp/Ppk values in the scorecard.

**Acceptance Scenarios**:

1. **Given** a material with multiple inspection batches, **When** viewing the scorecard, **Then** Cp/Cpk are calculated using estimated within-subgroup sigma (R̄/d2) rather than population standard deviation.
2. **Given** a material with fewer than 30 data points, **When** viewing performance indices, **Then** Pp/Ppk are calculated using sample standard deviation (N-1) to avoid understating variability.
3. **Given** a scorecard display, **When** hovering over capability indices, **Then** the UI clearly indicates the calculation method used (within vs overall).

---

### User Story 3 - Secure Data Access in Process Flow (Priority: P2)

As a System Administrator, I need to ensure that cached process-flow data is strictly scoped to the requesting user's permissions so that data leakage between users is prevented.

**Why this priority**: Security and data governance are critical in regulated environments; users must never see data from plants they are not authorized to access.

**Independent Test**: Query the same material as User A (access to Plant 1) and User B (access to Plant 2) and verify that User B does not receive cached data belonging to Plant 1.

**Acceptance Scenarios**:

1. **Given** a cached process-flow result for a material, **When** a different user with different permissions requests the same material, **Then** the system must either generate a new user-scoped cache or bypass the cache to ensure correct data masking.

---

### User Story 4 - Robust Signal Detection (Priority: P3)

As a Quality Analyst, I need Nelson Rule 4 (alternating points) to correctly detect patterns regardless of the starting direction (up or down) so that I don't miss evidence of process oscillation.

**Why this priority**: The current implementation only catches one phase of the alternating pattern, leading to false negatives in signal detection.

**Independent Test**: Provide a 14-point sequence that starts with a downward step (down-up-down-up...) and verify that it triggers a Rule 4 violation.

**Acceptance Scenarios**:

1. **Given** 14 consecutive points alternating up and down (starting downward), **When** rule detection is run, **Then** a Rule 4 signal is triggered at the 14th point.

---

### Edge Cases

- **Mixed Spec Values**: How does the system handle a material where the specification changed mid-way through the selected date range? (Assumption: Use the most recent spec and warn the user).
- **One-Sided Specifications**: How are Cp/Cpk calculated for characteristics that only have a "Max" or "Min" limit? (Requirement: Use unilateral capability formulas `CPU` or `CPL`).
- **Small Datasets**: How does the system handle MSA or Capability analysis with extremely small N? (Requirement: Display "Insufficient Data" warning when N < 5 for capability).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST calculate MSA EV, AV, and PV using multiplication with K constants (`* K1`, `* K2`, `* K3`) instead of division.
- **FR-002**: Scorecard MUST calculate Cp/Cpk using within-subgroup sigma estimated from the average range (R̄/d2).
- **FR-003**: System MUST use sample standard deviation (denominator N-1) for all Pp/Ppk and overall standard deviation calculations.
- **FR-004**: Process-flow cache key MUST include the user's identity or a hash of their access token to ensure user-scoped isolation.
- **FR-005**: Nelson Rule 4 MUST detect 14 consecutive alternating points regardless of the initial step direction.
- **FR-006**: System MUST infer the specification type (bilateral, unilateral_upper, unilateral_lower) based on the presence of LSL and USL values.
- **FR-007**: Exported scorecard data MUST use the same calculation logic and statistical formulas as the on-screen display.

### Key Entities *(include if feature involves data)*

- **CapabilityIndices**: A collection of indices (Cp, Cpk, Pp, Ppk) representing different aspects of process health.
- **MSAResult**: The output of a Gauge R&R study, including Repeatability, Reproducibility, and Part Variation components.
- **ProcessFlowCache**: A server-side storage mechanism for material lineage and node health, now requiring user-level isolation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of MSA calculations match AIAG 4th Edition reference values for test datasets.
- **SC-002**: Pp/Ppk values on small datasets (N=10) show a measurable increase in variability (approx 5%) compared to population-based calculations, correctly reflecting sample uncertainty.
- **SC-003**: Zero instances of cross-user data leakage in the process-flow view under concurrent multi-user load testing.
- **SC-004**: Nelson Rule 4 detection rate increases by 50% on randomly generated oscillating datasets (catching both up-first and down-first patterns).

## Assumptions

- **Subgroup Size**: Assume a default subgroup size of 1 if not explicitly provided or inferable from the data.
- **Data Frequency**: Assume that batches are ordered chronologically for R̄/d2 estimation.
- **User Identity**: Assume the system provides a stable unique identifier for each user for cache scoping.
- **Backwards Compatibility**: Existing cached process-flow data will be invalidated upon deployment of user-scoped caching.
