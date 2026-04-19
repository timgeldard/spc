import re
from typing import Literal, Optional

from pydantic import BaseModel, ValidationInfo, field_validator, model_validator

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_MATERIAL_ID_MAX_LEN = 40
_MIC_ID_MAX_LEN = 40
_MIC_SELECTION_KEY_MAX_LEN = 120
_CHART_TYPES = {"imr", "xbar_r", "xbar_s", "ewma", "cusum", "p_chart", "np_chart", "c_chart", "u_chart"}
_STRATIFY_KEYS = {"plant_id", "inspection_lot_id", "operation_id"}
_DEFAULT_UPSTREAM_DEPTH = 4
_DEFAULT_DOWNSTREAM_DEPTH = 3
_MAX_LINEAGE_DEPTH = 12


def _validate_date(v: Optional[str], field_name: str) -> Optional[str]:
    if v is not None and not _DATE_RE.match(v):
        raise ValueError(f"{field_name} must be in YYYY-MM-DD format")
    return v


class _DateRangeMixin(BaseModel):
    date_from: Optional[str] = None
    date_to: Optional[str] = None

    @field_validator("date_from")
    @classmethod
    def check_date_from(cls, v: Optional[str]) -> Optional[str]:
        return _validate_date(v, "date_from")

    @field_validator("date_to")
    @classmethod
    def check_date_to(cls, v: Optional[str]) -> Optional[str]:
        return _validate_date(v, "date_to")

    @model_validator(mode="after")
    def check_date_range(self) -> "_DateRangeMixin":
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("date_from must not be after date_to")
        return self


class ValidateMaterialRequest(BaseModel):
    material_id: str

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v


class CharacteristicsRequest(BaseModel):
    material_id: str
    plant_id: Optional[str] = None

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v


class _MicIdMixin(BaseModel):
    mic_id: str
    operation_id: Optional[str] = None

    @field_validator("mic_id")
    @classmethod
    def check_mic_id(cls, v: str) -> str:
        if len(v) > _MIC_ID_MAX_LEN:
            raise ValueError(f"mic_id must be at most {_MIC_ID_MAX_LEN} characters")
        return v


class ChartDataRequest(_DateRangeMixin, _MicIdMixin):
    material_id: str
    mic_name: Optional[str] = None
    plant_id: Optional[str] = None
    stratify_by: Optional[str] = None

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v

    @field_validator("stratify_by")
    @classmethod
    def check_stratify_by(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _STRATIFY_KEYS:
            raise ValueError(f"stratify_by must be one of {sorted(_STRATIFY_KEYS)}")
        return v


class DataQualityRequest(_DateRangeMixin, _MicIdMixin):
    material_id: str
    mic_name: Optional[str] = None
    plant_id: Optional[str] = None

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v


class ControlLimitsRequest(_DateRangeMixin, _MicIdMixin):
    material_id: str
    mic_name: Optional[str] = None
    plant_id: Optional[str] = None

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v


class ProcessFlowRequest(_DateRangeMixin):
    material_id: str
    upstream_depth: int = _DEFAULT_UPSTREAM_DEPTH
    downstream_depth: int = _DEFAULT_DOWNSTREAM_DEPTH

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v

    @field_validator("upstream_depth", "downstream_depth")
    @classmethod
    def check_lineage_depth(cls, v: int) -> int:
        if v < 1 or v > _MAX_LINEAGE_DEPTH:
            raise ValueError(f"lineage depth must be between 1 and {_MAX_LINEAGE_DEPTH}")
        return v


class ScorecardRequest(_DateRangeMixin):
    material_id: str
    plant_id: Optional[str] = None

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v


class AttributeCharacteristicsRequest(BaseModel):
    material_id: str
    plant_id: Optional[str] = None

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v


class PChartDataRequest(_DateRangeMixin, _MicIdMixin):
    material_id: str
    mic_name: Optional[str] = None
    plant_id: Optional[str] = None

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v


class CountChartDataRequest(_DateRangeMixin, _MicIdMixin):
    material_id: str
    mic_name: Optional[str] = None
    plant_id: Optional[str] = None
    chart_subtype: str = "c"

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v

    @field_validator("chart_subtype")
    @classmethod
    def check_chart_subtype(cls, v: str) -> str:
        if v not in ("c", "u", "np"):
            raise ValueError("chart_subtype must be 'c', 'u', or 'np'")
        return v


class SpecDriftWarning(BaseModel):
    """Returned in /chart-data responses when spec limits changed within the date range.

    A distinct_signatures count > 1 means the MIC was inspected against different
    tolerance limits across the requested period. Control limits computed over the full
    range are statistically invalid; the user should split by spec regime.
    """
    detected: bool
    distinct_signatures: int
    total_batches: int
    signature_set: list[str]   # the actual 'LSL|USL|Nominal' strings observed
    message: str


class LockLimitsRequest(BaseModel):
    material_id: str
    mic_id: str
    plant_id: Optional[str] = None
    operation_id: Optional[str] = None
    chart_type: str
    cl: float
    ucl: float
    lcl: float
    ucl_r: Optional[float] = None
    lcl_r: Optional[float] = None
    sigma_within: Optional[float] = None
    baseline_from: Optional[str] = None
    baseline_to: Optional[str] = None
    # Unified MIC identity metadata (populated by clients that have run Migration 013+)
    unified_mic_key: Optional[str] = None
    mic_origin: Optional[str] = None        # GENERIC | LOCAL | MIXED
    spec_signature: Optional[str] = None   # LSL|USL|Nominal at lock time
    locking_note: Optional[str] = None

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v

    @field_validator("mic_id")
    @classmethod
    def check_mic_id(cls, v: str) -> str:
        if len(v) > _MIC_ID_MAX_LEN:
            raise ValueError(f"mic_id must be at most {_MIC_ID_MAX_LEN} characters")
        return v

    @field_validator("chart_type")
    @classmethod
    def check_chart_type(cls, v: str) -> str:
        if v not in _CHART_TYPES:
            raise ValueError(f"chart_type must be one of {sorted(_CHART_TYPES)}")
        return v

    @model_validator(mode="after")
    def check_limit_order(self) -> "LockLimitsRequest":
        if self.chart_type == "p_chart":
            if self.ucl < self.lcl:
                raise ValueError("ucl must be greater than or equal to lcl for p_chart")
            return self
        if self.ucl <= self.lcl:
            raise ValueError("ucl must be greater than lcl")
        return self


class GetLockedLimitsRequest(BaseModel):
    material_id: str
    mic_id: str
    unified_mic_key: Optional[str] = None
    plant_id: Optional[str] = None
    operation_id: Optional[str] = None
    chart_type: str

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v

    @field_validator("mic_id")
    @classmethod
    def check_mic_id(cls, v: str) -> str:
        if len(v) > _MIC_ID_MAX_LEN:
            raise ValueError(f"mic_id must be at most {_MIC_ID_MAX_LEN} characters")
        return v

    @field_validator("chart_type")
    @classmethod
    def check_chart_type(cls, v: str) -> str:
        if v not in _CHART_TYPES:
            raise ValueError(f"chart_type must be one of {sorted(_CHART_TYPES)}")
        return v


class DeleteLockedLimitsRequest(BaseModel):
    material_id: str
    mic_id: str
    unified_mic_key: Optional[str] = None
    plant_id: Optional[str] = None
    operation_id: Optional[str] = None
    chart_type: str

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v

    @field_validator("mic_id")
    @classmethod
    def check_mic_id(cls, v: str) -> str:
        if len(v) > _MIC_ID_MAX_LEN:
            raise ValueError(f"mic_id must be at most {_MIC_ID_MAX_LEN} characters")
        return v

    @field_validator("chart_type")
    @classmethod
    def check_chart_type(cls, v: str) -> str:
        if v not in _CHART_TYPES:
            raise ValueError(f"chart_type must be one of {sorted(_CHART_TYPES)}")
        return v


class CompareScorecardsRequest(_DateRangeMixin):
    material_ids: list[str]
    plant_id: Optional[str] = None

    @field_validator("material_ids")
    @classmethod
    def check_material_ids(cls, v: list[str]) -> list[str]:
        if len(v) < 2 or len(v) > 3:
            raise ValueError("material_ids must contain 2 or 3 items")
        for mid in v:
            if len(mid) > _MATERIAL_ID_MAX_LEN:
                raise ValueError(f"material_id '{mid}' exceeds maximum length")
        return v


class SaveMSARequest(BaseModel):
    material_id: str
    mic_id: str
    n_operators: int
    n_parts: int
    n_replicates: int
    grr_pct: float
    repeatability: float
    reproducibility: float
    ndc: int
    results_json: str

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v

    @field_validator("results_json")
    @classmethod
    def check_results_json(cls, v: str) -> str:
        if len(v) > 65_535:
            raise ValueError("results_json too large (max 65535 chars)")
        return v


class CalculateMSARequest(BaseModel):
    measurement_data: list[list[list[float | None]]]
    tolerance: float = 0.0
    method: Literal["average_range", "anova"] = "average_range"

    @field_validator("measurement_data")
    @classmethod
    def check_measurement_data(cls, v: list[list[list[float | None]]]) -> list[list[list[float | None]]]:
        if len(v) < 2:
            raise ValueError("measurement_data must contain at least 2 operators")
        first_part_count = len(v[0]) if v[0] else 0
        if first_part_count < 2:
            raise ValueError("measurement_data must contain at least 2 parts")
        first_replicate_count = len(v[0][0]) if v[0] and v[0][0] else 0
        if first_replicate_count < 2:
            raise ValueError("measurement_data must contain at least 2 replicates")

        for operator in v:
            if len(operator) != first_part_count:
                raise ValueError("All operators must have the same part count")
            for part in operator:
                if len(part) != first_replicate_count:
                    raise ValueError("All parts must have the same replicate count")
        return v


class CorrelationRequest(_DateRangeMixin):
    material_id: str
    plant_id: Optional[str] = None
    min_batches: int = 10

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v

    @field_validator("min_batches")
    @classmethod
    def check_min_batches(cls, v: int) -> int:
        if v < 5 or v > 100:
            raise ValueError("min_batches must be between 5 and 100")
        return v


class CorrelationScatterRequest(_DateRangeMixin):
    material_id: str
    mic_a_id: str
    mic_b_id: str
    plant_id: Optional[str] = None

    @field_validator("material_id", "mic_a_id", "mic_b_id")
    @classmethod
    def check_lengths(cls, v: str, info: ValidationInfo) -> str:
        max_len = _MATERIAL_ID_MAX_LEN if info.field_name == "material_id" else _MIC_SELECTION_KEY_MAX_LEN
        if len(v) > max_len:
            raise ValueError(f"field must be at most {max_len} characters")
        return v


class MultivariateRequest(_DateRangeMixin):
    material_id: str
    mic_ids: list[str]
    plant_id: Optional[str] = None

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, v: str) -> str:
        if len(v) > _MATERIAL_ID_MAX_LEN:
            raise ValueError(f"material_id must be at most {_MATERIAL_ID_MAX_LEN} characters")
        return v

    @field_validator("mic_ids")
    @classmethod
    def check_mic_ids(cls, v: list[str]) -> list[str]:
        cleaned = [item for item in dict.fromkeys(v) if item]
        if len(cleaned) < 2:
            raise ValueError("mic_ids must contain at least 2 characteristics")
        if len(cleaned) > 8:
            raise ValueError("mic_ids must contain at most 8 characteristics")
        for mic_id in cleaned:
            if len(mic_id) > _MIC_SELECTION_KEY_MAX_LEN:
                raise ValueError(f"mic_id '{mic_id}' exceeds maximum length")
        return cleaned
