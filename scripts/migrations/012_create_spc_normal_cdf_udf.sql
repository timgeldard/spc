-- Migration 012: normal CDF helper UDF for DPMO calculations.
--
-- Uses a polynomial approximation (Abramowitz & Stegun 7.1.26, max error 1.5e-7)
-- because ERF() is not available as a warehouse built-in on all DBR versions.
--
-- spc_normal_cdf(z) returns Φ(z) = P(X ≤ z) for X ~ N(0,1).

CREATE OR REPLACE FUNCTION `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_normal_cdf`(z DOUBLE)
RETURNS DOUBLE
COMMENT 'Normal CDF approximation (Abramowitz & Stegun 7.1.26, max error 1.5e-7). Returns P(X <= z) for X ~ N(0,1).'
RETURN
  CASE
    WHEN z IS NULL THEN NULL
    WHEN z >  20.0 THEN 1.0
    WHEN z < -20.0 THEN 0.0
    ELSE
      -- erf(x) via A&S 7.1.26, then Φ(z) = 0.5*(1 + erf(z/√2))
      -- t = 1 / (1 + 0.3275911 * |z/√2|)
      -- erfc_half = t*(p1 + t*(p2 + t*(p3 + t*(p4 + t*p5)))) * exp(-(z/√2)^2)
      -- erf(z/√2) = sign(z) * (1 - erfc_half)
      0.5 * (1.0 + SIGN(z) * (
        1.0 - (
          (1.0 / (1.0 + 0.3275911 * ABS(z / SQRT(2.0)))) *
          (0.254829592 + (1.0 / (1.0 + 0.3275911 * ABS(z / SQRT(2.0)))) *
          (-0.284496736 + (1.0 / (1.0 + 0.3275911 * ABS(z / SQRT(2.0)))) *
          (1.421413741 + (1.0 / (1.0 + 0.3275911 * ABS(z / SQRT(2.0)))) *
          (-1.453152027 + (1.0 / (1.0 + 0.3275911 * ABS(z / SQRT(2.0)))) *
          1.061405429)))) *
          EXP(-(z / SQRT(2.0)) * (z / SQRT(2.0)))
        )
      ))
  END;
