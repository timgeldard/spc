CREATE TABLE IF NOT EXISTS `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_exclusions` (
  event_id STRING NOT NULL,
  material_id STRING NOT NULL,
  mic_id STRING NOT NULL,
  mic_name STRING,
  plant_id STRING,
  chart_type STRING NOT NULL,
  date_from STRING,
  date_to STRING,
  rule_set STRING,
  justification STRING NOT NULL,
  action STRING,
  excluded_count INT NOT NULL,
  excluded_points_json STRING NOT NULL,
  before_limits_json STRING,
  after_limits_json STRING,
  user_id STRING NOT NULL,
  event_ts TIMESTAMP NOT NULL
)
USING DELTA
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = 'true'
);
