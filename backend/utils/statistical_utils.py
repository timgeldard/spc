import math
from typing import Optional, List, Tuple

def mean(values: List[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)

def stddev(values: List[float], ddof: int = 1) -> float:
    if len(values) < 2:
        return 0.0
    m = mean(values)
    return math.sqrt(sum((x - m) ** 2 for x in values) / (len(values) - ddof))

def moving_range(values: List[float]) -> List[float]:
    if len(values) < 2:
        return []
    return [abs(values[i] - values[i-1]) for i in range(1, len(values))]

def compute_imr_limits(values: List[float]) -> Tuple[float, float, float]:
    """Compute I-MR control limits."""
    x_bar = mean(values)
    mr = moving_range(values)
    mr_bar = mean(mr)
    d2 = 1.128 # for n=2
    sigma_within = mr_bar / d2
    ucl = x_bar + 3 * sigma_within
    lcl = x_bar - 3 * sigma_within
    return lcl, x_bar, ucl

def compute_capability_indices(
    values: List[float], 
    usl: Optional[float] = None, 
    lsl: Optional[float] = None,
    target: Optional[float] = None
) -> dict:
    """Compute Cp, Cpk, Pp, Ppk, Cpm."""
    mu = mean(values)
    s_overall = stddev(values, ddof=1)
    
    mr = moving_range(values)
    mr_bar = mean(mr)
    d2 = 1.128
    sigma_within = mr_bar / d2
    
    results = {}
    
    # Potential Capability (Short-term)
    if usl is not None and lsl is not None:
        results["cp"] = (usl - lsl) / (6 * sigma_within) if sigma_within > 0 else None
    
    if usl is not None or lsl is not None:
        cpk_u = (usl - mu) / (3 * sigma_within) if usl is not None and sigma_within > 0 else float('inf')
        cpk_l = (mu - lsl) / (3 * sigma_within) if lsl is not None and sigma_within > 0 else float('inf')
        results["cpk"] = min(cpk_u, cpk_l)
        
    # Performance (Long-term)
    if usl is not None and lsl is not None:
        results["pp"] = (usl - lsl) / (6 * s_overall) if s_overall > 0 else None
        
    if usl is not None or lsl is not None:
        ppk_u = (usl - mu) / (3 * s_overall) if usl is not None and s_overall > 0 else float('inf')
        ppk_l = (mu - lsl) / (3 * s_overall) if lsl is not None and s_overall > 0 else float('inf')
        results["ppk"] = min(ppk_u, ppk_l)

    # Taguchi Cpm
    if target is not None and usl is not None and lsl is not None:
        denom = 6 * math.sqrt(s_overall**2 + (mu - target)**2)
        results["cpm"] = (usl - lsl) / denom if denom > 0 else None
        
    return results

def detect_nelson_rules(values: List[float], centerline: float, sigma: float) -> dict:
    """Detect Nelson Rules 1-8."""
    violations = {i: [] for i in range(1, 9)}
    if sigma <= 0:
        return violations
        
    z_scores = [(x - centerline) / sigma for x in values]
    
    for i, z in enumerate(z_scores):
        # Rule 1: Point > 3 sigma
        if abs(z) > 3:
            violations[1].append(i)
            
        # Rule 2: 9 consecutive same side
        if i >= 8:
            window = z_scores[i-8:i+1]
            if all(w > 0 for w in window) or all(w < 0 for w in window):
                violations[2].append(i)
                
        # Rule 3: 6 consecutive increasing/decreasing
        if i >= 5:
            window = values[i-5:i+1]
            if all(window[j] > window[j-1] for j in range(1, 6)) or \
               all(window[j] < window[j-1] for j in range(1, 6)):
                violations[3].append(i)
                
        # Rule 4: 14 consecutive alternating
        if i >= 13:
            window = values[i-13:i+1]
            diffs = [window[j] - window[j-1] for j in range(1, 14)]
            if all(diffs[j] * diffs[j-1] < 0 for j in range(1, 13)):
                violations[4].append(i)
                
        # Rule 5: 2 of 3 > 2 sigma same side
        if i >= 2:
            window = z_scores[i-2:i+1]
            if sum(1 for w in window if w > 2) >= 2 or \
               sum(1 for w in window if w < -2) >= 2:
                violations[5].append(i)
                
        # Rule 6: 4 of 5 > 1 sigma same side
        if i >= 4:
            window = z_scores[i-4:i+1]
            if sum(1 for w in window if w > 1) >= 4 or \
               sum(1 for w in window if w < -1) >= 4:
                violations[6].append(i)
                
        # Rule 7: 15 consecutive within 1 sigma
        if i >= 14:
            window = z_scores[i-14:i+1]
            if all(abs(w) < 1 for w in window):
                violations[7].append(i)
                
        # Rule 8: 8 consecutive > 1 sigma both sides
        if i >= 7:
            window = z_scores[i-7:i+1]
            if all(abs(w) > 1 for w in window) and \
               not (all(w > 1 for w in window) or all(w < -1 for w in window)):
                violations[8].append(i)
                
    return violations

def compute_non_parametric_capability(
    values: List[float],
    usl: Optional[float] = None,
    lsl: Optional[float] = None
) -> dict:
    """ISO 22514-2 (Percentile Method)."""
    if not values:
        return {}
    
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    
    def get_percentile(p):
        idx = p * (n - 1)
        i = math.floor(idx)
        d = idx - i
        if i >= n - 1: return sorted_vals[-1]
        return sorted_vals[i] * (1 - d) + sorted_vals[i+1] * d

    p00135 = get_percentile(0.00135)
    p50 = get_percentile(0.5)
    p99865 = get_percentile(0.99865)
    
    results = {}
    if usl is not None or lsl is not None:
        ppk_u = (usl - p50) / (p99865 - p50) if usl is not None and p99865 > p50 else float('inf')
        ppk_l = (p50 - lsl) / (p50 - p00135) if lsl is not None and p50 > p00135 else float('inf')
        results["ppk_non_parametric"] = min(ppk_u, ppk_l)
        
    return results
