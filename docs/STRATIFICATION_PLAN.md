# SPC App — Stratification Roadmap

Plan for implementing multi-dimensional root-cause analysis in the SPC App.

---

## 1. Phase I: Core Dimensionality [COMPLETED]
Goal: Enable basic slicing by key SAP master data attributes.

*   **[x] Plant Stratification** — Filter all charts/scorecards by producing plant.
*   **[x] Lot-level Stratification** — Slice data by `INSPECTION_LOT_ID`.
*   **[x] Operation-level Stratification** — Slice data by `OPERATION_ID`.
*   **[x] SQL Whitelisting** — Implemented strict column whitelisting in `spc_charts_dal.py` to prevent logic errors.

---

## 2. Phase II: Advanced Categorical Stratification [IN PROGRESS]
Goal: Enable deeper root-cause identification across the supply chain.

*   **[ ] Work Center / Resource** — Stratify by the specific machine or production line ($PP-PI$ Resource).
*   **[ ] Shift / Operator** — Filter by production shift or the recorded inspector (Q03).
*   **[ ] Vendor / Raw Material Batch** — Link SPC signals to upstream raw material origins.

---

## 3. Phase III: Multi-Variate Stratification [BACKLOG]
Goal: Automate the discovery of variation sources.

*   **[ ] ANOVA Integration** — Automatically suggest which dimension (Plant vs. Line vs. Machine) is contributing the most to the total variance.
*   **[ ] Split-Grid View** — Render multiple small-multiples charts for each unique value in a stratification dimension.

---

## 4. Current filter model

The SPC filter bar currently exposes:

| Filter | State key | Scope |
|---|---|---|
| Material ID | `selectedMaterial` | All tabs |
| MIC characteristic | `selectedMIC` | Control Charts only |
| Date from / to | `dateFrom`, `dateTo` | Filters by `POSTING_DATE` on production movements |

Stratification adds a **split dimension**: instead of (or in addition to)
aggregating all batches for a material together, the user picks a dimension
value and the chart re-renders with only batches matching that value.
Alternatively, the app could overlay multiple series — one per dimension value —
on the same chart.

---

## 2. Dimension-by-dimension analysis

### 2.1 Plant

**Feasibility: High — data already available.**

`gold_batch_mass_balance_v` already exposes `PLANT_ID` and joins to `gold_plant`
for `PLANT_NAME`. The `/process-flow` endpoint already returns `plant_name` on
every node.

**What needs to change:**

**Backend — `spc.py`**

Add `plant_id: Optional[str] = None` to `CharacteristicsRequest`,
`ChartDataRequest`, and `ScorecardRequest`. When set, append to each query:

```sql
-- in chart-data:  filter mass balance CTE
AND mb.PLANT_ID = {_esc(body.plant_id)}

-- in characteristics / scorecard: join to mass balance for plant filter
INNER JOIN (
    SELECT DISTINCT BATCH_ID
    FROM {_tbl('gold_batch_mass_balance_v')}
    WHERE PLANT_ID = {_esc(body.plant_id)}
      AND MOVEMENT_CATEGORY = 'Production'
) plant_batches ON plant_batches.BATCH_ID = r.BATCH_ID
```

Add a new `GET /plants?material_id=...` endpoint returning distinct plants
for a material (used to populate the filter dropdown).

**Frontend**

1. New hook `usePlants(materialId)` — calls `GET /api/spc/plants?material_id=...`
   when material is set.
2. Add a **Plant** dropdown to `SPCFilterBar` between Material and MIC.
   When changed, dispatch `SET_PLANT` and clear the MIC selection.
3. `SPCContext` — add `selectedPlant` to state; include in all downstream
   hook calls.

**Estimated effort:** 2–3 days backend + frontend.

---

### 2.2 Machine / Work Centre

**Feasibility: Medium — depends on Connected Plant silver layer.**

In SAP, the producing work centre is captured on the production order routing
(`PLPO` — routing operations) and on the confirmation (`AFRU`). Batch-to-work-centre
linkage flows through the production order number:

```
BATCH_ID → AUFK.AUFNR → PLPO.ARBPL (work centre)
                      → CRHD.ARBPL (work centre master)
```

This join is not currently surfaced in any gold view used by the SPC module.

**What needs to change:**

**Unity Catalog — new gold view (or enrichment of existing)**

```sql
-- Proposed: gold_batch_work_centre_v
CREATE OR REPLACE VIEW connected_plant_uat.gold.gold_batch_work_centre_v AS
SELECT
    aufm.CHARG                  AS BATCH_ID,
    aufm.MATNR                  AS MATERIAL_ID,
    aufm.WERKS                  AS PLANT_ID,
    plpo.ARBPL                  AS WORK_CENTRE_ID,
    crhd.ARBPL                  AS WORK_CENTRE_NAME,
    crhd.WERKS                  AS WORK_CENTRE_PLANT
FROM silver_production_order_movements aufm          -- derived from bronze_aufm
JOIN silver_routing_operations plpo                  -- derived from bronze_plpo
    ON plpo.AUFNR = aufm.AUFNR
JOIN silver_work_centre crhd                         -- derived from bronze_crhd
    ON crhd.ARBPL = plpo.ARBPL
   AND crhd.WERKS = aufm.WERKS
WHERE aufm.BWART = '101'  -- GR from production order only
```

Underlying SAP tables:
- `AUFM` — goods movements for production orders
- `PLPO` — task list operations / routing
- `CRHD` — work centre master header

**Backend & Frontend:** Same pattern as Plant — add `work_centre_id` filter
parameter, new `/work-centres?material_id=...` endpoint, add dropdown to filter bar.

**Risk:** Work centre data may not be in the Connected Plant silver layer yet.
Check `connected_plant_uat.silver` for `silver_work_centre` or `bronze_crhd`
before committing to this dimension.

**Estimated effort:** 1–2 days gold view + 2–3 days backend + frontend,
assuming silver tables exist. Add 3–5 days if new bronze/silver extraction needed.

---

### 2.3 Vendor Batch

**Feasibility: Medium–High — requires purchasing and batch master enrichment.**

A vendor batch (external batch number) identifies the specific supplier lot
used when a raw material was received. In SAP it is stored on:

- `MCH1` / `MCHA` — batch master (field `LICHA` = vendor batch number)
- `EKPO` + `EKBE` — purchasing document / goods receipt history

The link to production: a raw material batch received from a vendor gets consumed
in a production order. The SPC module tracks quality results at finished-material
level, so vendor batch stratification means: "for batches of finished material X,
which were made using vendor batches of raw material Y from supplier Z?"

This is a **two-level join**:

```
gold_batch_quality_result_v (finished material batch)
    → gold_batch_lineage (upstream raw material batch)
        → MCH1/MCHA.LICHA (vendor batch number on the RM batch)
        → EKBE/LFB1 (vendor / supplier name)
```

**What needs to change:**

**Unity Catalog — new gold view**

```sql
-- Proposed: gold_batch_vendor_v
CREATE OR REPLACE VIEW connected_plant_uat.gold.gold_batch_vendor_v AS
SELECT
    mcha.MATNR      AS MATERIAL_ID,
    mcha.CHARG      AS BATCH_ID,
    mcha.LICHA      AS VENDOR_BATCH_ID,
    lfa1.LIFNR      AS VENDOR_ID,
    lfa1.NAME1      AS VENDOR_NAME
FROM silver_batch_master mcha                        -- bronze_mcha (MCH1/MCHA)
LEFT JOIN silver_vendor lfa1                         -- bronze_lfa1 (LFA1 vendor master)
    ON lfa1.LIFNR = mcha.ELIFN                       -- ELIFN = preferred vendor on batch
WHERE mcha.LICHA IS NOT NULL
```

**Backend approach for vendor batch stratification:**

Because vendor batch is a property of the *upstream* raw material — not the
finished material being charted — the filter works differently:

1. User picks a raw material (e.g. `RM-SALT`) and a vendor batch ID.
2. The backend looks up which finished-material batches used that vendor batch
   (via `gold_batch_lineage` + `gold_batch_vendor_v`).
3. The chart-data query is then filtered to only those finished-material batch IDs.

This is a two-step lookup that requires a new dedicated endpoint or a
subquery inside the existing chart-data endpoint.

**Estimated effort:** 3–5 days (gold view + backend logic + frontend UX, which
needs a two-level picker: raw material → vendor batch).

---

### 2.4 Operator

**Feasibility: High effort — data availability uncertain.**

Operator (the person who ran the production) is captured in SAP via:
- `AFRU` — order operation confirmations (field `USNAM` = user ID who confirmed)
- `USR02` / `ADDR3` — user master for name resolution

The link is:
```
BATCH_ID → AUFK.AUFNR → AFRU.AUFNR → AFRU.USNAM (operator SAP user)
```

**Known risks:**
1. `AFRU` may not be extracted to bronze in the Connected Plant pipeline if
   the initial scope focused on quality and logistics rather than shop-floor
   confirmations.
2. Even if extracted, many sites use shift-level or work-centre-level
   confirmations rather than individual operator confirmations.
3. GDPR/privacy implications: displaying individual operator names linked to
   quality failures requires careful access control design.

**Recommended approach:**
- First verify `connected_plant_uat.bronze.bronze_afru` (or equivalent) exists.
- If it does, create `gold_batch_operator_v` joining `bronze_afru` to `bronze_aufm`
  on `AUFNR`, resolving user IDs to names via `bronze_usr21`/`bronze_addr3`.
- Scope filter: show only operators, not user IDs, in the dropdown.
- Apply the same Unity Catalog RLS policy as the plant filter to ensure
  a plant supervisor cannot see operator-level data outside their plant.

**Estimated effort:** 5–7 days if bronze data exists; 10+ days if new
extraction pipeline needed.

---

## 3. Recommended implementation order

| Priority | Dimension | Effort | Data available now |
|---|---|---|---|
| 1 | Plant | Low | Yes |
| 2 | Work Centre | Medium | Likely — verify |
| 3 | Vendor Batch | Medium–High | Partial — MCH1/MCHA needed |
| 4 | Operator | High | Unknown — verify AFRU |

Start with **Plant** as it requires no new gold views and immediately enables
multi-site comparison — the highest-value use case for a process engineering team.

---

## 4. Shared frontend architecture changes

All four dimensions share the same frontend change pattern. This should be
built as a generalised stratification slot rather than four separate features.

### 4.1 State changes (`SPCContext.js`)

```js
// Add to initial state:
selectedPlant: null,            // { plant_id, plant_name }
selectedWorkCentre: null,       // { work_centre_id, work_centre_name }
selectedVendorBatch: null,      // { vendor_batch_id, vendor_name, raw_material_id }
selectedOperator: null,         // { operator_id, operator_name }

// Add to reducer:
case 'SET_PLANT':
  return { ...state, selectedPlant: action.payload, selectedMIC: null }
case 'SET_WORK_CENTRE':
  return { ...state, selectedWorkCentre: action.payload, selectedMIC: null }
// etc.
```

### 4.2 Filter bar layout

```
[ Material input ]  [ Validate ]
[ Plant ▼ ]  [ Work Centre ▼ ]  [ Vendor Batch ▼ ]  [ From ]  [ To ]
[ MIC ▼ ]
```

Each dropdown is only enabled after the dimensions above it are satisfied
(e.g. Work Centre only enables after Plant is selected).

### 4.3 Hook pattern

Each dimension follows the same hook shape as `useCharacteristics`:

```js
export function usePlants(materialId) {
  const [plants, setPlants] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!materialId) { setPlants([]); return }
    setLoading(true)
    fetch(`/api/spc/plants?material_id=${encodeURIComponent(materialId)}`)
      .then(r => r.ok ? r.json() : r.json().then(b => Promise.reject(b.detail)))
      .then(d => setPlants(d.plants ?? []))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [materialId])

  return { plants, loading, error }
}
```

### 4.4 Backend endpoint pattern

Each new `GET /api/spc/<dimension>` endpoint returns a list of valid dimension
values for the currently selected material (and upstream dimensions), so the
dropdowns never show options with zero data.

```python
@router.get("/plants")
async def spc_plants(
    material_id: str,
    x_forwarded_access_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    token = _resolve_token(x_forwarded_access_token, authorization)
    _check_warehouse_config()
    query = f"""
        SELECT DISTINCT
            mb.PLANT_ID,
            COALESCE(p.PLANT_NAME, mb.PLANT_ID) AS plant_name
        FROM {_tbl('gold_batch_mass_balance_v')} mb
        LEFT JOIN {_tbl('gold_plant')} p ON p.PLANT_ID = mb.PLANT_ID
        WHERE mb.MATERIAL_ID = {_esc(material_id)}
          AND mb.MOVEMENT_CATEGORY = 'Production'
        ORDER BY plant_name
    """
    try:
        rows = _run_sql(token, query)
    except Exception as exc:
        _handle_sql_error(exc)
    return {"plants": rows}
```

---

## 5. Multi-series overlay mode (advanced)

Rather than filtering *to* a dimension value, an alternative UX lets the user
select **all** and the chart renders one series per dimension value (e.g. one
line per plant on the same control chart). This enables direct visual comparison.

This requires:
- Changing the chart-data endpoint to return `plant_id` on each data point.
- The frontend groups points by plant and renders multiple `line` series in
  ECharts (ECharts handles multi-series natively and colour-codes them automatically).
- A legend showing plant names.

This is a natural follow-on once single-value filtering is working.

---

## 6. Unity Catalog permissions for stratification

When stratification by operator or vendor is added, ensure new gold views
have appropriate column-level masking:

```sql
-- Example: mask operator name for users without HR data access
ALTER VIEW gold_batch_operator_v
ALTER COLUMN operator_name
SET MASK hr_data_mask;
```

Plant-level row-level security should cascade automatically if the existing
`user_has_plant_access()` row filter is applied to the new views.
