# Data Model: Statistical Correctness & Security Hardening

## Entities

### CapabilityIndices
| Field | Type | Description |
|---|---|---|
| cp | float | Potential capability (using within-subgroup sigma) |
| cpk | float | Potential capability index |
| pp | float | Process performance (using overall sample stddev) |
| ppk | float | Process performance index |
| sigma_within | float | Estimated within-subgroup variation (R-bar/d2) |
| sigma_overall | float | Overall process variation (sample stddev) |
| n_samples | int | Count of valid data points |

### ProcessFlowCache
| Field | Type | Description |
|---|---|---|
| key | string | Composite key: `user_hash|material_id|dates` |
| user_hash | string | SHA-256 hash of the requester's identity |
| material_id | string | SAP Material ID |
| data | JSON | Cached node and edge results |
| expires_at | datetime | TTL timestamp |

## State Transitions

### Signal Detection (Nelson Rule 4)
- **Input**: Sequence of 14 points.
- **Transition**: `Detecting` -> `Signaled` if `all((x[i]-x[i-1])*(x[i-1]-x[i-2]) < 0)`.
- **Direction Independence**: Logic must yield the same result for `[1, 2, 1, 2...]` and `[2, 1, 2, 1...]`.
