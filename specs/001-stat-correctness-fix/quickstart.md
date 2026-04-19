# Quickstart: Statistical Correctness & Security Hardening

## Verification Steps

### 1. MSA Mathematical Correctness
Run the new Gauge R&R validation test:
```bash
pytest backend/tests/test_msa.py -k "test_aiag_reference_parity"
```
This test compares the backend `calculate_msa` results against the AIAG 4th Edition reference dataset.

### 2. Scorecard Capability Differentiation
Check that `Cp` and `Pp` differ on the scorecard for materials with high between-batch variation:
1. Select material `MAT-001`.
2. Observe `Cp` (within-sigma) and `Pp` (overall-sigma) columns.
3. Verify `Pp` uses sample standard deviation ($n-1$).

### 3. Cache Isolation
1. Login as User A.
2. Load Process Flow for `MAT-001`.
3. Login as User B (with restricted plant access).
4. Load Process Flow for `MAT-001`.
5. Verify that User B does not see Plant 1 data from User A's cache.

### 4. Signal Detection
Load the "Nelson Rule 4" test case in the frontend:
1. Navigate to Control Charts.
2. Provide a 14-point oscillating sequence.
3. Confirm Rule 4 signal triggers regardless of whether the first step is up or down.
