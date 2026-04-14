-- Migration 014: Add Unified MIC Key metadata to spc_locked_limits.
--
-- Strategy: additive-only columns — all existing locks keyed by (material_id,
-- mic_id, plant_id, operation_id, chart_type) remain fully valid. New locks
-- also store the plant-scoped unified_mic_key, provenance, spec fingerprint, and
-- an optional justification note.
--
-- Lookup priority after this migration:
--   1. Preferred: query by unified_mic_key (handles Generic + Local MIC variants
--      that resolve to the same physical measurement).
--   2. Legacy fallback: query by (mic_id, plant_id, operation_id) for rows written
--      before this migration.
--
-- The spec_signature column captures the LSL|USL|Nominal fingerprint at lock time.
-- On subsequent chart loads the backend compares live spec_signature against the
-- locked value; a mismatch triggers a "stale lock" warning to the user.

ALTER TABLE `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_locked_limits`
ADD COLUMNS (
    unified_mic_key  STRING
        COMMENT 'Plant-scoped canonical MIC key written at lock time: PLANT_ID||UPPER(TRIM(MIC_NAME))||UOM. Preferred lookup for new locks. NULL on rows created before Migration 014.',

    mic_origin       STRING
        COMMENT 'MIC provenance at time of locking: GENERIC (pure QPMK master), LOCAL (lot-specific copy), MIXED (both types observed in baseline). NULL on legacy rows.',

    spec_signature   STRING
        COMMENT 'Spec fingerprint at lock time: LSL|USL|Nominal from spc_quality_metric_subgroup_v. Used to detect post-lock spec drift. If live spec_signature no longer matches, a stale-lock warning is raised.',

    locking_note     STRING
        COMMENT 'Optional free-text justification captured when limits are locked (e.g., "Phase I baseline 2024-Q4, 32 batches, Cp=1.42").'
);
