-- Migration 012: optional helper UDF for DPMO calculations.
--
-- Release 1 only needs this if the inline ERF-based expression in the metric
-- view becomes unwieldy or parser-fragile on the target warehouse.

CREATE OR REPLACE FUNCTION `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_normal_cdf`(z DOUBLE)
RETURNS DOUBLE
COMMENT 'Normal cumulative distribution function used for SPC DPMO calculations.'
RETURN 0.5 * (1 + ERF(z / SQRT(2)));
