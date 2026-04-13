# SPC App — Data Lineage

Traces every gold view consumed by the SPC module back through the Connected Plant
medallion architecture to the originating SAP tables.

Catalog: `connected_plant_uat` · Schema: `gold`
Auth: token passthrough — all queries run as the signed-in user; Unity Catalog
row/column-level policies are enforced automatically.

---

## 1. Gold views consumed by the SPC module

| Gold view / table | SPC endpoints that read it |
|---|---|
| `gold_batch_quality_result_v` | `/validate-material`, `/materials`, `/characteristics`, `/chart-data`, `/scorecard`, `/process-flow` |
| `gold_material` | `/validate-material`, `/materials`, `/process-flow` |
| `gold_batch_mass_balance_v` | `/chart-data`, `/scorecard`, `/process-flow` |
| `gold_batch_lineage` | `/process-flow` |
| `gold_plant` | `/process-flow` |

---

## 2. `gold_batch_quality_result_v`

**Purpose:** One row per quantitative (or qualitative) quality inspection result,
linking a batch to a MIC (Master Inspection Characteristic) result with
specification limits.

### Columns used by SPC

| Column | Type | Description |
|---|---|---|
| `MATERIAL_ID` | STRING | SAP material number |
| `BATCH_ID` | STRING | SAP batch number |
| `MIC_ID` | STRING | Inspection characteristic code |
| `MIC_NAME` | STRING | Characteristic description |
| `QUANTITATIVE_RESULT` | STRING/DOUBLE | Numeric measured value |
| `TARGET_VALUE` | STRING | Specification nominal value |
| `TOLERANCE` | STRING | Half-tolerance (USL = target + tol) |
| `INSPECTION_RESULT_VALUATION` | STRING | `A` = Accepted, `R` = Rejected |
| `INSPECTION_LOT_ID` | STRING | Inspection lot identifier |
| `OPERATION_ID` | STRING | Inspection operation / step |
| `SAMPLE_ID` | STRING | Individual sample identifier |

### Lineage

```
gold_batch_quality_result_v
│
├── silver_inspection_result          (cleansed + typed result rows)
│   │
│   └── bronze_qase                   (raw SAP QASE extract)
│       └── SAP table: QASE           Inspection results at characteristic level
│           Columns used:
│             PRUEFLOS  → INSPECTION_LOT_ID
│             VORGLFNR  → OPERATION_ID
│             PMNR      → characteristic index
│             ERGEBNIS  → QUANTITATIVE_RESULT
│             EINHEIT   → result unit of measure
│
├── silver_inspection_lot             (lot header — material, batch, dates)
│   │
│   └── bronze_qals                   (raw SAP QALS extract)
│       └── SAP table: QALS           Inspection lots
│           Columns used:
│             PRUEFLOS  → INSPECTION_LOT_ID
│             MATNR     → MATERIAL_ID
│             CHARG     → BATCH_ID
│             LOSTART   → lot creation date
│             WERK      → plant
│
├── silver_inspection_characteristic  (MIC code + name + spec limits)
│   │
│   ├── bronze_qaspr                  (raw SAP QASPR extract)
│   │   └── SAP table: QASPR         Inspection specs (planned values per lot)
│   │       Columns used:
│   │         PRUEFLOS  → INSPECTION_LOT_ID
│   │         VORGLFNR  → OPERATION_ID
│   │         KURZTEXT  → MIC_NAME
│   │         SOLLWERT  → TARGET_VALUE
│   │         TOLERANZ  → TOLERANCE
│   │
│   └── bronze_qpm (or QPMK)         MIC master catalogue
│       └── SAP table: QPMK          Inspection characteristic master
│           Columns used:
│             MERKMAL   → MIC_ID
│             KURZTEXT  → MIC_NAME
│
└── silver_inspection_valuation       (accept/reject decision)
    │
    └── bronze_qame                   (raw SAP QAME extract)
        └── SAP table: QAME          Inspection results - valuations
            Columns used:
              PRUEFLOS  → INSPECTION_LOT_ID
              BEURTEILUNG → INSPECTION_RESULT_VALUATION  (A/R)
```

**Key SAP tables at a glance:**

| SAP Table | Description |
|---|---|
| `QALS` | Inspection lot master — links lot to material, batch, plant |
| `QASE` | Quantitative inspection results at characteristic level |
| `QASPR` | Inspection specifications (planned values, tolerances) |
| `QPMK` | Inspection characteristic master catalogue |
| `QAME` | Valuation (accepted / rejected) per inspection characteristic |
| `QAMR` | Inspection results overview (summary per lot/characteristic) |

---

## 3. `gold_material`

**Purpose:** Language-keyed material descriptions (used with `LANGUAGE_ID = 'E'`
throughout the SPC module to resolve `MATERIAL_ID → MATERIAL_NAME`).

### Columns used by SPC

| Column | Type | Description |
|---|---|---|
| `MATERIAL_ID` | STRING | SAP material number |
| `MATERIAL_NAME` | STRING | Material description |
| `LANGUAGE_ID` | STRING | Language key (`E` = English) |

### Lineage

```
gold_material
│
└── silver_material_description
    │
    └── bronze_makt
        └── SAP table: MAKT          Material descriptions (language-dependent)
            Columns used:
              MATNR  → MATERIAL_ID
              MAKTX  → MATERIAL_NAME
              SPRAS  → LANGUAGE_ID

    (joined to)
    bronze_mara
        └── SAP table: MARA          General material master (base attributes)
            Columns used:
              MATNR  → MATERIAL_ID
              MTART  → material type
              MATKL  → material group
```

---

## 4. `gold_batch_mass_balance_v`

**Purpose:** One row per material movement for a batch. The SPC module uses this
to obtain `POSTING_DATE` (production date) for ordering batches on the time axis,
and to look up `PLANT_ID` for plant-level context on the process flow.

### Columns used by SPC

| Column | Type | Description |
|---|---|---|
| `MATERIAL_ID` | STRING | SAP material number |
| `BATCH_ID` | STRING | SAP batch number |
| `POSTING_DATE` | DATE | Date of the goods movement |
| `PLANT_ID` | STRING | Producing plant |
| `MOVEMENT_CATEGORY` | STRING | `Production`, `Sales`, `Transfer`, etc. |

### Lineage

```
gold_batch_mass_balance_v
│
├── silver_material_document          (cleansed goods movements)
│   │
│   ├── bronze_mseg                   (raw SAP MSEG extract)
│   │   └── SAP table: MSEG          Material document items (goods movements)
│   │       Columns used:
│   │         MBLNR  → document number
│   │         ZEILE  → line item
│   │         MATNR  → MATERIAL_ID
│   │         CHARG  → BATCH_ID
│   │         WERKS  → PLANT_ID
│   │         BWART  → movement type (101=GR, 261=GI, 601=customer delivery)
│   │         MENGE  → quantity
│   │         MEINS  → unit of measure
│   │
│   └── bronze_mkpf                   (raw SAP MKPF extract)
│       └── SAP table: MKPF          Material document headers
│           Columns used:
│             MBLNR  → document number
│             BUDAT  → POSTING_DATE
│             BLDAT  → document date
│
└── ref_movement_type_category        (movement type → MOVEMENT_CATEGORY mapping)
    Derived from SAP movement type (BWART):
      101, 102       → Production (GR from production order)
      261, 262       → Production (GI to production order)
      601, 602       → Sales (GI to customer)
      311, 312, 313  → Transfer
```

**Key SAP tables at a glance:**

| SAP Table | Description |
|---|---|
| `MSEG` | Material document items — every goods movement line |
| `MKPF` | Material document headers — posting date, document type |
| `MARD` | Storage location stock (snapshot) |
| `AUFK` | Production order master (links batch to order) |

---

## 5. `gold_batch_lineage`

**Purpose:** Parent → child relationships between material batches,
used by the process flow DAG to walk upstream/downstream up to 4 levels.

### Columns used by SPC

| Column | Type | Description |
|---|---|---|
| `PARENT_MATERIAL_ID` | STRING | Upstream (input) material |
| `CHILD_MATERIAL_ID` | STRING | Downstream (output) material |
| `LINK_TYPE` | STRING | `PRODUCTION` = manufacturing relationship |

### Lineage

```
gold_batch_lineage
│
├── silver_batch_component            (production order component consumption)
│   │
│   ├── bronze_resb                   (raw SAP RESB extract)
│   │   └── SAP table: RESB          Reservations and dependent requirements
│   │       Columns used:
│   │         AUFNR  → production order number
│   │         MATNR  → PARENT_MATERIAL_ID (component / input material)
│   │         CHARG  → parent batch
│   │         RSPOS  → item number
│   │
│   └── bronze_aufm                   (raw SAP AUFM extract)
│       └── SAP table: AUFM          Goods movements for production orders
│           Columns used:
│             AUFNR  → production order number
│             MATNR  → CHILD_MATERIAL_ID  (output / produced material)
│             CHARG  → child batch
│             BWART  → movement type (101 = GR, 261 = GI)
│
└── silver_production_order_header
    │
    └── bronze_aufk
        └── SAP table: AUFK          Production order master
            Columns used:
              AUFNR  → order number
              MATNR  → finished material
              WERKS  → plant
```

**Key SAP tables at a glance:**

| SAP Table | Description |
|---|---|
| `AUFK` | Production order header (order ↔ material ↔ plant) |
| `AUFM` | Goods movements against a production order |
| `RESB` | Reservation items — components planned for an order |
| `COBK` | Cost object documents (alternate lineage source) |

---

## 6. `gold_plant`

**Purpose:** Plant name lookup, used to enrich process flow nodes with
a human-readable plant name.

### Columns used by SPC

| Column | Type | Description |
|---|---|---|
| `PLANT_ID` | STRING | SAP plant code |
| `PLANT_NAME` | STRING | Plant description |

### Lineage

```
gold_plant
│
└── bronze_t001w
    └── SAP table: T001W             Plant / branch master data
        Columns used:
          WERKS  → PLANT_ID
          NAME1  → PLANT_NAME
          LAND1  → country
          ORT01  → city / location
```

---

## 7. Medallion layer summary

```
RAW (SAP extract)        BRONZE (landed as-is)    SILVER (typed, cleansed)    GOLD (business-ready)
─────────────────        ─────────────────────    ────────────────────────    ─────────────────────
SAP QALS ──────────────► bronze_qals ──────────► silver_inspection_lot ─────►
SAP QASE ──────────────► bronze_qase ──────────► silver_inspection_result ──► gold_batch_quality_result_v
SAP QASPR ─────────────► bronze_qaspr ─────────► silver_inspection_char ─────►
SAP QAME ──────────────► bronze_qame ──────────► silver_inspection_valuation ►
SAP QPMK ──────────────► bronze_qpmk ──────────► (ref dimension) ────────────►

SAP MARA ──────────────► bronze_mara ──────────►
                                                  silver_material_description ► gold_material
SAP MAKT ──────────────► bronze_makt ──────────►

SAP MSEG ──────────────► bronze_mseg ──────────►
                                                  silver_material_document ───► gold_batch_mass_balance_v
SAP MKPF ──────────────► bronze_mkpf ──────────►

SAP AUFK ──────────────► bronze_aufk ──────────►
SAP AUFM ──────────────► bronze_aufm ──────────► silver_batch_component ─────► gold_batch_lineage
SAP RESB ──────────────► bronze_resb ──────────►

SAP T001W ─────────────► bronze_t001w ──────────────────────────────────────► gold_plant
```

> **Note:** Bronze table names follow the Connected Plant naming convention
> (`bronze_<sap_table_lowercase>`). Silver view names are inferred from the
> transformation pattern. Verify exact names in the Unity Catalog metastore
> under `connected_plant_uat.bronze` and `connected_plant_uat.silver`.

---

## 8. Unity Catalog access path

```
Databricks Apps proxy
    │
    └── X-Forwarded-Access-Token  (user's OIDC token)
            │
            └── FastAPI backend (spc.py)
                    │
                    └── Databricks SQL Warehouse (Statement REST API or official SQL connector)
                            │
                            └── Unity Catalog (connected_plant_uat.gold.*)
                                    │
                                    └── Row/column policies enforced per user
```

All SPC queries run **as the signed-in user**. No service account credentials
are used in production. A user who lacks `SELECT` on a gold view will receive
a `403 Forbidden` from the app (surfaced from a Unity Catalog permission error).
