from pydantic import BaseModel, field_validator

_MATERIAL_ID_MAX_LEN = 40
_BATCH_ID_MAX_LEN = 80


def _validate_identifier(value: str, field_name: str, max_len: int) -> str:
    trimmed = value.strip()
    if not trimmed:
        raise ValueError(f"{field_name} must not be blank")
    if len(trimmed) > max_len:
        raise ValueError(f"{field_name} must be at most {max_len} characters")
    return trimmed


class TraceRequest(BaseModel):
    material_id: str
    batch_id: str

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, value: str) -> str:
        return _validate_identifier(value, "material_id", _MATERIAL_ID_MAX_LEN)

    @field_validator("batch_id")
    @classmethod
    def check_batch_id(cls, value: str) -> str:
        return _validate_identifier(value, "batch_id", _BATCH_ID_MAX_LEN)


class SummaryRequest(BaseModel):
    batch_id: str

    @field_validator("batch_id")
    @classmethod
    def check_batch_id(cls, value: str) -> str:
        return _validate_identifier(value, "batch_id", _BATCH_ID_MAX_LEN)


class ImpactRequest(BaseModel):
    batch_id: str

    @field_validator("batch_id")
    @classmethod
    def check_batch_id(cls, value: str) -> str:
        return _validate_identifier(value, "batch_id", _BATCH_ID_MAX_LEN)


class BatchDetailsRequest(BaseModel):
    material_id: str
    batch_id: str

    @field_validator("material_id")
    @classmethod
    def check_material_id(cls, value: str) -> str:
        return _validate_identifier(value, "material_id", _MATERIAL_ID_MAX_LEN)

    @field_validator("batch_id")
    @classmethod
    def check_batch_id(cls, value: str) -> str:
        return _validate_identifier(value, "batch_id", _BATCH_ID_MAX_LEN)
