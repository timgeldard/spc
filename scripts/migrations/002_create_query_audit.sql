CREATE TABLE IF NOT EXISTS `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_query_audit` (
  audit_id STRING NOT NULL,
  event_type STRING NOT NULL,
  sql_hash STRING,
  error_id STRING,
  request_path STRING,
  detail_json STRING NOT NULL,
  user_id STRING NOT NULL,
  created_at TIMESTAMP NOT NULL
)
USING DELTA
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = 'true'
);
