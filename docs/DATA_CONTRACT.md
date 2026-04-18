# Gold View Data Contract

The SPC application reads from a small set of **gold views it does not own**:

- `gold_batch_quality_result_v` — per-sample inspection results
- `gold_batch_mass_balance_v` — plant/batch provenance and posting dates
- `gold_material` — material master display names

The upstream ETL team owns these views. The SPC app treats them as a stable
API: if columns change shape, this app's charts produce wrong numbers, not
compile errors. **This document is the contract between the two teams.**

## The frozen contract

The machine-readable version lives in [`backend/schema/gold_views.v1.json`](../backend/schema/gold_views.v1.json).
It is the source of truth enforced at runtime.

Every column the app reads is listed, with its expected type and nullability.
Note that SAP-style UPPERCASE column names are the wire format; the DAL
normalises to lowercase where needed.

### Views and required columns

See `gold_views.v1.json`. Human summary:

| View | Column | Notes |
|---|---|---|
| `gold_batch_quality_result_v` | `MATERIAL_ID`, `MIC_ID`, `MIC_NAME`, `INSPECTION_METHOD` | Primary MIC identity |
| | `BATCH_ID`, `OPERATION_ID`, `INSPECTION_LOT_ID`, `SAMPLE_ID` | Inspection hierarchy |
| | `QUANTITATIVE_RESULT`, `QUALITATIVE_RESULT` | Value payload — mutually exclusive per MIC |
| | `TARGET_VALUE`, `TOLERANCE` | Specification — `TOLERANCE` may be symmetric (`"±0.5"`) or asymmetric (`"0.3...0.7"`) |
| | `INSPECTION_RESULT_VALUATION` | Accept/reject SAP flag |
| `gold_batch_mass_balance_v` | `MATERIAL_ID`, `BATCH_ID`, `PLANT_ID` | Plant-to-batch link |
| | `POSTING_DATE` | Used as `batch_date` for charting |
| | `MOVEMENT_CATEGORY` | Filtered to `'Production'` |
| `gold_material` | `MATERIAL_ID`, `MATERIAL_NAME`, `LANGUAGE_ID` | Display names — LANGUAGE_ID filtered to `'E'` |

### Explicit non-guarantees

The app **does not** rely on:

- SAP QM table-level fields not listed above (QALS, QAMV, QAMB, QAMR, QAVE) —
  those are the domain of the upstream gold-layer ETL.
- Usage-decision / disposition fields (rework, hold, scrap) — these are
  **not yet modelled**. Phase 2.2 will request upstream to add them; until
  then, the app cannot distinguish normal from rework lots.
- Inspection-phase fields (incoming / in-process / final) — same status as
  above. Phase 2.2 will add them.

If the ETL team intends to add such fields, that is welcomed and unblocks
Phase 2.2 directly — coordinate before the schema version is bumped.

## Runtime enforcement

At startup and on every `/api/ready` call, the app runs:

```sql
SELECT table_name, column_name
FROM system.information_schema.columns
WHERE table_catalog = '<env>'
  AND table_schema = '<env>'
  AND table_name IN (...three views...)
```

Result is compared to the frozen contract. If any required column is missing
or any view is absent:

- `/api/ready` returns **HTTP 503** with a structured `schema_check` body
  listing the specific gaps.
- The Databricks Apps health check trips, taking the app out of rotation.
- Users see a maintenance banner, not silently wrong numbers.

Results are cached for 60 seconds to avoid warehouse thrash from a readiness
flood. Test seam: `backend.utils.schema_contract.clear_cache()`.

## Change procedure

When the upstream team plans a change to any of these views, the flow is:

1. **Upstream posts a change notice** (Slack/Jira) at least one sprint
   before the change lands, listing which columns are added / renamed /
   removed and a target ETL deploy date.
2. **SPC team evaluates impact**:
   - Additions: always safe. Bump the schema file to a new version when the
     app starts reading the new column.
   - Renames: need coordinated deploy. Use a view alias if possible to hold
     the old name through the cutover.
   - Removals: only safe if the SPC app has already stopped reading the
     column. Otherwise block the removal.
3. **SPC team updates** `backend/schema/gold_views.v1.json`, bumps the
   `version` field, and lands the change in the same PR as the DAL edits
   that use the new shape.
4. **Deploy order**: SPC app first (new contract is tolerant of the old shape)
   or upstream first (new shape is tolerant of the old DAL) — never both at
   once. Coordinate via release ticket.
5. **Post-deploy**: run `/api/ready` against the target environment and
   confirm `"gold_view_schema": "ok"` in the response.

## Versioning

- `version: "1"` is the current contract. Do not edit in place for breaking
  changes — bump to `version: "2"` and keep `gold_views.v1.json` for
  rollback until the next stable deploy clears.
- Minor additions (new optional columns) may stay on `v1` — note them in a
  `changelog` section at the top of the JSON file.
- The version surfaces in the `/api/ready` response as
  `schema_contract_version`. Ops dashboards should alert if this changes
  unexpectedly.

## FAQ

**Q: Why not generate the contract from the DAL code?**
A: The DAL mutates frequently; the contract is intentionally stable. Drift
between the two is the bug we want `/api/ready` to catch.

**Q: Why check on every readiness call?**
A: Schema drift can happen any time the upstream team re-runs their DDL.
The app reads at runtime, not build time, so a build-time check wouldn't
catch a drift that lands after deploy. 60-second cache amortises the cost.

**Q: What if the warehouse is offline?**
A: `/api/ready` already catches that earlier with its `SELECT 1` probe. If
that succeeds but the schema query fails, we return 503 with an error note.

**Q: Can the app keep serving when the contract breaks?**
A: No — this is intentional. Silently serving with wrong column shape is
worse than being visibly down. A graceful degradation would hide a real bug.
