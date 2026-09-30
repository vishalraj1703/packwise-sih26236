"""Pydantic input validation: values, units, evidence status and required inputs."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from . import reference as ref

InputStatus = Literal["measured", "reported", "reference", "assumed", "unknown"]
SealMethod = Literal["heat-impulse", "band-sealer", "vacuum-chamber", "vacuum-gas-flush", "tray-sealer", "can-seamer", "sack-stitch", "screw-cap", "clip-tie", "none"]

# Plausible ranges per unit, so obvious unit mistakes (e.g. 40 instead of 4 %) are caught.
UNIT_RANGES = {
    "% w.b.": (0, 60), "%": (0, 100), "pH": (0, 14), "aw": (0, 1), "mg CO₂/kg·h": (0.1, 1000), "days": (0, 3650), "yes": (0, 1), "": (-1e9, 1e9),
}


class Model(BaseModel):
    model_config = ConfigDict(extra="ignore")


class Evidenced(Model):
    value: float
    lo: Optional[float] = None
    hi: Optional[float] = None
    unit: str = Field(max_length=30)
    status: InputStatus
    sourceId: Optional[str] = None
    note: Optional[str] = Field(default=None, max_length=300)
    date: Optional[str] = None

    @model_validator(mode="after")
    def _check(self):
        rng = UNIT_RANGES.get(self.unit)
        if rng and not (rng[0] <= self.value <= rng[1]):
            raise ValueError(f"{self.value} {self.unit} is outside the plausible range {rng[0]}–{rng[1]} — check the unit")
        if self.lo is not None and self.lo > self.value:
            raise ValueError("lo must be ≤ value")
        if self.hi is not None and self.hi < self.value:
            raise ValueError("hi must be ≥ value")
        if self.status == "unknown":
            raise ValueError("a value with status 'unknown' should be omitted instead")
        return self


class StorageSpec(Model):
    type: Literal["ambient-room", "cool-room", "cold-room", "retail-shelf"]
    tC: Optional[float] = Field(default=None, ge=-30, le=60)
    rhPct: Optional[float] = Field(default=None, ge=0, le=100)
    status: Literal["measured", "user", "assumed"]


class Portion(Model):
    id: str = Field(max_length=20)
    label: str = Field(max_length=80)
    kg: float = Field(gt=0, le=100000)
    use: Literal["bulk", "retail"]
    storageDays: float = Field(ge=0, le=730)
    storage: StorageSpec
    packSizeKg: Optional[float] = Field(default=None, gt=0)


class Place(Model):
    name: str = Field(max_length=160)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    state: Optional[str] = None


class Properties(Model):
    initialMoistureWb: Optional[Evidenced] = None
    waterActivity: Optional[Evidenced] = None
    rco2At20: Optional[Evidenced] = None
    measurements: Optional[dict[str, Evidenced]] = None


class Identification(Model):
    method: Literal["photo-ai", "user-select"]
    confirmed: bool
    confidence: Optional[float] = Field(default=None, ge=0, le=1)


class AssessmentInput(Model):
    commodityId: str
    state: str
    identification: Identification
    portions: list[Portion] = Field(min_length=1, max_length=6)
    properties: Properties = Properties()
    equipment: list[SealMethod] = []
    budgetInrPerKg: Optional[float] = Field(default=None, gt=0)
    journey: dict
    userState: Optional[str] = None
    costSettings: Optional[dict] = None

    @field_validator("commodityId")
    @classmethod
    def _known_commodity(cls, v: str) -> str:
        try:
            ref.get_commodity(v)
        except KeyError as e:
            raise ValueError(f"unknown commodity '{v}'") from e
        return v

    @model_validator(mode="after")
    def _check(self):
        c = ref.get_commodity(self.commodityId)
        if self.state not in c["states"]:
            raise ValueError(f"'{self.state}' is not a processing state for {c['name']} (use one of {', '.join(c['states'])})")
        ids = [p.id for p in self.portions]
        if len(set(ids)) != len(ids):
            raise ValueError("portion ids must be unique")
        for key in ("origin", "destination", "distanceKm", "driveHours", "transitWeather", "destinationClimate"):
            if key not in self.journey:
                raise ValueError(f"journey.{key} is required — analyse the journey first")
        return self

    def engine_dict(self) -> dict:
        d = self.model_dump(exclude_none=True)
        d.setdefault("properties", {})
        return d


class JourneyRequest(Model):
    origin: Place
    destination: Place
    departureDate: str
    storageDays: float = Field(ge=0, le=730)


class LoginRequest(Model):
    email: str = Field(max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=1, max_length=200)


class RegisterRequest(Model):
    email: str = Field(max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=200)
    name: str = Field(min_length=2, max_length=120)
    org: Optional[str] = Field(default=None, max_length=200)
