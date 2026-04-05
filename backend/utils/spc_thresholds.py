"""
Cpk capability thresholds used for status classification.

Centralised here so backend and tests reference one source of truth.
Matching values are exported from frontend/src/spc/spcConstants.js.
"""

CPK_HIGHLY_CAPABLE: float = 1.67
CPK_CAPABLE: float = 1.33
CPK_MARGINAL: float = 1.00
