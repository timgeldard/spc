-- Migration 003: Add operation_id to spc_locked_limits
-- operation_id + mic_id is the true composite key for an inspection characteristic.
-- Existing rows will have operation_id = NULL (treated as "no operation scope").

ALTER TABLE `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_locked_limits`
ADD COLUMNS (operation_id STRING);
