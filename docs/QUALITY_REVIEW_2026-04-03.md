# Burn-Everything Quality Review

**Repository:** `spc`
**Review date:** 2026-04-03  
**Reviewer perspective:** Quality management app expert — SPC statistics, SAP QM/PP-PI semantics, security, operational hardening  
**Branch reviewed:** `main` (synced before review)  
**Previous review:** `docs/QUALITY_REVIEW_2026-04-02.md`

---

## Executive summary

The architecture is sound and the previous review's high-priority items (debug endpoint gating, rate limiter wiring) have been resolved. What remains are deeper, harder-to-spot defects: **statistically incorrect calculations** that will produce wrong capability numbers silently, a **security hole in the process-flow cache**, and **systematic breakage in the MSA module**. These are not cosmetic issues — they will cause a quality engineer to make wrong decisions based on the numbers this app shows them.

---

## CRITICAL — Wrong answers, silent failures

### C1. MSA Gauge R&R calculations are systematically incorrect
**File:** `frontend/src/spc/msa/msaCalculations.js`

The K constants (K1, K2, K3) store `1/d2*` values (e.g. `K1[2] = 0.8862 = 1/1.128`), matching the AIAG MSA 4th Edition Appendix B table. The correct formula is:

```
EV = R̄_bar × K1     (multiply)
```

But the code divides:

```js
const ev = rBarBar / k1   // WRONG: rBarBar / 0.8862 = rBarBar × 1.128
```

This inflates EV (repeatability) by a factor of `d2*(r)` ≈ 1.13–1.69× depending on replicate count. AV and PV have the same inversion bug (`xBarDiff / k2` and `rParts / k3`). Because GRR derives from EV and AV, and NDC from PV and GRR, every output of the MSA module is wrong. A marginal gauge will appear capable (%GRR inflated), or a capable gauge will fail — the direction depends on the specific study parameters.

**Fix:** Change all three to multiplication: `ev = rBarBar * k1`, `pv = rParts * k3`, and update the `avRaw` formula accordingly (`(xBarDiff * k2) ** 2 - ...`).

---

### C2. Scorecard treats Cp = Pp and Cpk = Ppk (makes them meaningless)
**File:** `backend/routers/spc.py` lines 889–911, `backend/routers/export.py` lines 196–205

The scorecard endpoint sets `sigma_within = stddev` where `stddev` is `STDDEV_POP` from SQL — the overall population standard deviation. Then it computes:

```python
cp  = spec_width / (6 * sigma_within)   # = Pp
cpk = min((usl - mean) / (3 * sigma_within), ...)  # = Ppk
pp  = spec_width / (6 * stddev)         # identical
ppk = min(...)                          # identical
```

All four indices collapse to the same value. Cp/Cpk are meaningless unless they use **within-subgroup sigma** (estimated from R̄/d2). The scorecard has no access to within-subgroup sigma because it aggregates across all batches in SQL — it cannot compute true Cp/Cpk. Options: (a) label the scorecard columns Pp/Ppk only and drop Cp/Cpk; (b) pre-compute within-subgroup sigma per MIC in a CTE using sequential batch ordering.

The `export.py` `_fetch_scorecard` function has the same problem and additionally misses the `LSL...USL` tolerance format entirely (uses `MAX(TRY_CAST(r.TOLERANCE AS DOUBLE))` — no `...` parsing), so exported capability numbers diverge from the on-screen values.

---

### C3. Pp/Ppk use population stddev (N) instead of sample stddev (N−1)
**Files:** `frontend/src/spc/calculations.js:21-25`, `backend/routers/spc.py:832`

`stddevPop` divides by N. The AIAG SPC Reference Manual 4th Edition defines Pp/Ppk using the sample standard deviation (denominator N−1). Using population stddev **understates variability** and **inflates Pp/Ppk** — on small datasets (< 30 points, common in batch manufacturing) the error is material. The frontend `computeCapability` and both backend scorecard endpoints use the population form.

**Fix:** Add `stddevSample` (divide by n-1) and use it for Pp/Ppk.  
Note: Cp/Cpk are unaffected — they use `sigmaWithin` from R̄/d2, not stddev.

---

### C4. Process-flow cache is not user-scoped — cross-user data leak
**File:** `backend/routers/spc.py` lines 44–57, 614–616, 796

```python
cache_key = f"{body.material_id}|{body.date_from or ''}|{body.date_to or ''}"
```

The cache stores results without regard to the requesting user's token. If User A (access to plants P1 and P2) queries material `MAT001`, the result is cached. When User B (access to plant P1 only) queries the same material, they receive User A's full result including data from P2 that Unity Catalog would have blocked.

This directly defeats the "no app-level filtering needed" security model described in the README. In a regulated manufacturing environment this is a data governance violation.

**Fix:** Include a hash of the token (or user identity from the JWT) in the cache key. Or invalidate the cache on a per-token basis. Alternatively, disable the cache entirely — 30-minute staleness is already questionable for a live quality system.

---

## HIGH — Logic errors and broken features

### H1. Nelson Rule 4 only detects one phase of the alternating pattern
**File:** `frontend/src/spc/calculations.js` lines 460–469

The alternating check:
```js
const alternating = w.every((v, j) => {
  if (j === 0) return true
  const diff = v - w[j - 1]
  return j % 2 === 1 ? diff > 0 : diff < 0
})
```

This requires the sequence to start with an **upward** step (j=1 must have diff > 0). A sequence that starts downward (down-up-down-up) will never trigger Rule 4. Nelson (1984) defines the rule as any 14-point alternating pattern regardless of starting direction.

**Fix:**
```js
const alternating = w.every((v, j) => {
  if (j < 2) return true
  return (v - w[j - 1]) * (w[j - 1] - w[j - 2]) < 0
})
```

---

### H2. `_infer_spec_type` is a stub that always returns `'bilateral_symmetric'`
**File:** `backend/routers/spc.py` lines 112–119

```python
def _infer_spec_type(nominal, tolerance):
    if nominal is not None and tolerance is not None and tolerance > 0:
        return "bilateral_symmetric"
    return "bilateral_symmetric"   # both branches return the same value
```

Confirmed dead code on the scorecard side too (line 937):
```python
row["spec_type"] = "bilateral_symmetric" if (usl is not None and lsl is not None) else "bilateral_symmetric"
```

One-sided specs are common in food ingredient QM (e.g. "max moisture 5%", "min protein 12%"). Treating them as bilateral produces incorrect Cpk: a one-sided upper spec should only compute `(USL − x̄) / (3σ)`, not `min(...)` with a phantom LSL. The hardcoded spec type silently distorts capability for these characteristics.

---

### H3. `spc_characteristics` excludes pure attribute MICs
**File:** `backend/routers/spc.py` lines 394–411

The characteristics query filters `QUANTITATIVE_RESULT IS NOT NULL`. Attribute characteristics in SAP QM (those with only `QUALITATIVE_RESULT` populated) are excluded entirely, even though the attribute-characteristics endpoint and P-chart feature exist to handle them. The `validate-material` endpoint has the same gap — a material with only attribute data returns `{"valid": false}`.

---

### H4. Rate limiter client key is IP address — broken behind Databricks Apps proxy
**File:** `backend/utils/rate_limit.py` line 107

```python
client = request.client.host if request.client else "unknown"
```

In Databricks Apps, all requests arrive through the platform's reverse proxy. `request.client.host` will be the internal proxy IP, not the user's IP. Per-user rate limiting will not function — all users share a single bucket. The user identity is available in the `x-forwarded-access-token` JWT and should be used as the client key (token sub/email claim), or `x-forwarded-for` if that's populated by the platform.

---

### H5. `computeAll` uses spec values from `points[0]` only
**File:** `frontend/src/spc/calculations.js` lines 636–647

```js
const nominal   = points[0]?.nominal   ?? null
const tolerance = points[0]?.tolerance ?? null
const specConfig = { spec_type, nominal, tolerance, usl: points[0]?.usl ?? null, ... }
```

If the first data point has null spec values but subsequent points do not (batch with no inspection lot setup, spec revision, etc.), the entire chart computes with null specs. The correct approach is to take the **modal or most-recent** spec across all points, or to surface a "mixed/missing spec" warning rather than silently nulling out capability.

---

## MEDIUM — Semantic and architectural issues

### M1. `export.py` duplicates and diverges from scorecard SQL
**File:** `backend/routers/export.py` lines 147–177

`_fetch_scorecard` in export.py is a near-copy of the scorecard query in `spc.py` but:
- Missing the `LSL...USL` range format parsing (no `LOCATE('...', ...)` logic)
- Missing `distinct_nominal_count`/`distinct_tolerance_count` → no `has_mixed_spec` warning in export
- Missing `QUALITATIVE_RESULT IS NULL OR QUALITATIVE_RESULT = ''` filter

A user exporting a scorecard will get different (wrong) Cpk numbers than what they see on screen. This is a data integrity problem for a quality record.

**Fix:** Refactor: the scorecard endpoint should return structured data that the export endpoint serialises — not re-query with different SQL.

---

### M2. `sys.setrecursionlimit(10000)` at module level
**File:** `backend/main.py` line 22

The comment implied this was needed for `WITH RECURSIVE` CTE handling. The CTE runs on Databricks, not in Python. The only Python recursion is `_build_tree → _attach_children`, which for deeply branching supply chains could legitimately stack-deep. The correct fix is to convert `_attach_children` to an iterative BFS/DFS, not to raise the global Python recursion limit which affects the entire process (including other async tasks and exception handlers).

---

### M3. `spec_type` hardcoded to `"bilateral_symmetric"` in chart-data endpoint
**File:** `backend/routers/spc.py` line 586

```python
row["spec_type"] = "bilateral_symmetric"
```

Even when only `usl` is present (no `lsl`), the spec type is sent as bilateral. The frontend `computeCapability` correctly handles `unilateral_upper`/`unilateral_lower` spec types — the backend never sends them. This is a separate instance of the same root cause as H2.

---

### M4. Specification data taken from first point — wrong for multi-lot batches
**File:** `backend/routers/spc.py` lines 506–518 (chart-data endpoint)

`TRY_CAST(r.TARGET_VALUE AS DOUBLE)` and tolerance are returned per-row (correct), but the spec values will vary across inspection lots in the same batch if the recipe version changed. The frontend currently uses only `points[0]` spec values (see H5 above). There is no detection of within-batch spec changes, which means a capability calculation silently uses the spec from the oldest inspection result in the batch.

---

### M5. Pp/Ppk DPMO uses 1.5σ long-term shift convention — not disclosed to users
**File:** `frontend/src/spc/calculations.js` lines 291–292

```js
const zScore = cpk !== null ? round3(cpk * 3) : null
const dpmo   = zScore !== null ? Math.round(normalCDF(-(zScore - 1.5)) * 1_000_000) : null
```

DPMO is computed with the Motorola 1.5σ shift convention — this is a short-term → long-term conversion. In food/ingredient manufacturing, DPMO is almost always reported without the shift (short-term actual defect rate). There is no disclosure to the user that DPMO includes a 1.5σ adjustment. A quality manager comparing this DPMO to supplier-reported DPMO (which may use different conventions) will get nonsensical comparisons.

---

### M6. `useSPCCalculations` passes a `Set` to `useMemo` dependencies
**File:** `frontend/src/spc/hooks/useSPCCalculations.js` line 35

```js
}, [points, chartType, excludedIndices, ruleSet, excludeOutliers])
```

React's `useMemo` uses `Object.is` for dependency comparison. A `Set` is compared by reference, not by content. `SPCContext` creates `new Set(...)` on every `TOGGLE_EXCLUDE_INDEX` dispatch, so `useMemo` will rerun on every render even when the excluded indices haven't changed. For large datasets this causes unnecessary recomputation on every keystroke elsewhere in the UI.

**Fix:** Convert to `JSON.stringify([...excludedIndices].sort())` or use a sorted array as the dependency.

---

## LOW — Polish and completeness

### L1. Tests cover calculations but not statistical correctness
`calculations.test.js` tests structural properties (keys present, UCL > CL > LCL) but not numerical accuracy. A test with known ground-truth values (e.g. AIAG SPC Reference Manual example datasets) would catch regressions in d2 constants and limit formulae. The MSA bug in C1 would be caught immediately by a test that verifies EV against a hand-calculated example.

### L2. No test for WECO/Nelson rule detection
The entire rule detection system has no unit tests. A test with a crafted sequence (e.g. 9 points above CL for Nelson Rule 2) verifying the correct indices are returned would be straightforward and high-value.

### L3. Process flow node status is rejection-rate-based, not CPK-based
The README says "CPK-based health colouring per node." The implementation (`spc.py` lines 748–755) uses `rejection_rate < 0.02 → green, < 0.10 → amber, else red` — a batch rejection rate, not a Cpk value. `estimated_cpk` is set to `None` unconditionally (line 758). Either the README is wrong or the implementation is. If Cpk-based colouring is the intent, the process-flow query needs per-node capability from the MIC data.

### L4. Locked-limits `MERGE INTO spc_locked_limits` assumes table exists with no migration
The `lock_limits` endpoint merges into `spc_locked_limits` (a Delta table) with no setup script, migration guard, or graceful 404 for the case where the table doesn't exist. A new deployment will return a SQL error on the first lock attempt.

### L5. `useCompareScorecard` and `useCorrelation` call undocumented endpoints
`/api/spc/compare-scorecard` and `/api/spc/correlation` exist in `spc.py` (verified) but are not listed in the README API reference table. Any future documentation-driven audit will miss them.

---

## Scorecard

| Area | Current | Previous review | Delta |
|---|---|---|---|
| Architecture & Security pattern | 8/10 | 8/10 | → same (cache hole discovered) |
| SPC/statistical correctness | 5/10 | 8/10 | ↓ C1–C3 are real, silent errors |
| SAP QM/PP-PI semantic robustness | 6/10 | 6.5/10 | ↓ spec type never inferred |
| Testing depth | 5/10 | 5.5/10 | → same (no rule tests added) |
| Operational hardening | 7/10 | 6/10 | ↑ debug gating + rate limiter done |
| MSA module | 2/10 | not reviewed | NEW — systematically wrong |

**Overall: 5.5/10** — strong skeleton, but the numbers it produces for a quality engineer are wrong in ways that are hard to spot without reference data.

---

## Priority fix order

1. **C1** — MSA K constant division/multiplication inversion (wrong by 1.13–1.69×)  
2. **C2** — Scorecard Cp/Cpk = Pp/Ppk collapse (label honestly or compute correctly)  
3. **C3** — Pp/Ppk population vs sample stddev (inflate capability on small batches)  
4. **C4** — Process-flow cache cross-user data leak (security)  
5. **H1** — Nelson Rule 4 misses down-first alternating pattern  
6. **H2/M3** — Spec type always bilateral (one-sided specs get wrong Cpk)  
7. **M1** — Export SQL diverges from API SQL (different Cpk in downloaded files)  
8. **H4** — Rate limiter IP key broken behind proxy  
9. **H5** — Spec config from `points[0]` only  
10. **M2** — Replace `sys.setrecursionlimit` with iterative `_attach_children`
