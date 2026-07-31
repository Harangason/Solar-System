"""Domain models for the Solar-Oberth probe and its assemblies."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from math import exp, log


G0_KM_S2 = 0.00980665


class MissionPhase(StrEnum):
    INIT = "INIT"
    EARTH_LAUNCH = "EARTH_LAUNCH"
    EARTH_PARKING_ORBIT = "EARTH_PARKING_ORBIT"
    STAGE_SEPARATION = "STAGE_SEPARATION"
    EARTH_SWING_ORBIT = "EARTH_SWING_ORBIT"
    EARTH_ESCAPE = "EARTH_ESCAPE"
    SUNDIVER_TRANSFER = "SUNDIVER_TRANSFER"
    SOLAR_APPROACH = "SOLAR_APPROACH"
    SOLAR_OBERTH_BURN = "SOLAR_OBERTH_BURN"
    PAYLOAD_SEPARATION = "PAYLOAD_SEPARATION"
    PAYLOAD_COMMISSIONING = "PAYLOAD_COMMISSIONING"
    ELECTRIC_SAIL_DEPLOYMENT = "ELECTRIC_SAIL_DEPLOYMENT"
    ELECTRIC_SAIL_CHARGING = "ELECTRIC_SAIL_CHARGING"
    ELECTRIC_SAIL_PROPULSION = "ELECTRIC_SAIL_PROPULSION"
    DEEP_SPACE_CRUISE = "DEEP_SPACE_CRUISE"
    MISSION_COMPLETE = "MISSION_COMPLETE"
    MISSION_WARNING = "MISSION_WARNING"
    MISSION_ABORT = "MISSION_ABORT"


class PowerMode(StrEnum):
    SAFE = "safe"
    COMMISSIONING = "commissioning"
    HIGH_VOLTAGE = "high-voltage"
    CRUISE = "cruise"


@dataclass(slots=True, kw_only=True)
class Vector3:
    x: float
    y: float
    z: float = 0.0

    def as_list(self) -> list[float]:
        return [self.x, self.y, self.z]


@dataclass(slots=True, kw_only=True)
class SpacecraftComponent:
    name: str
    dry_mass_kg: float
    attached: bool = True
    active: bool = False

    def __post_init__(self) -> None:
        if self.dry_mass_kg < 0:
            raise ValueError(f"Die Masse von {self.name} darf nicht negativ sein.")

    @property
    def mass_kg(self) -> float:
        return self.dry_mass_kg if self.attached else 0.0

    def activate(self) -> None:
        if not self.attached:
            raise RuntimeError(f"{self.name} kann nach der Trennung nicht aktiviert werden.")
        self.active = True

    def detach(self) -> None:
        self.active = False
        self.attached = False


@dataclass(slots=True, kw_only=True)
class PropulsionStage(SpacecraftComponent):
    propellant_mass_kg: float
    specific_impulse_seconds: float

    def __post_init__(self) -> None:
        SpacecraftComponent.__post_init__(self)
        if self.propellant_mass_kg < 0 or self.specific_impulse_seconds <= 0:
            raise ValueError("Treibstoffmasse und spezifischer Impuls sind ungültig.")

    @property
    def mass_kg(self) -> float:
        return (self.dry_mass_kg + self.propellant_mass_kg) if self.attached else 0.0

    def burn(self, requested_delta_v_km_s: float, vehicle_mass_kg: float) -> tuple[float, float]:
        """Return achieved delta-v and consumed propellant using Tsiolkovsky."""
        if not self.attached or not self.active or requested_delta_v_km_s <= 0:
            return 0.0, 0.0
        required = vehicle_mass_kg * (
            1 - exp(-requested_delta_v_km_s / (self.specific_impulse_seconds * G0_KM_S2))
        )
        consumed = min(required, self.propellant_mass_kg)
        final_mass = max(vehicle_mass_kg - consumed, 1e-9)
        achieved = self.specific_impulse_seconds * G0_KM_S2 * log(vehicle_mass_kg / final_mass)
        self.propellant_mass_kg -= consumed
        return achieved, consumed


@dataclass(slots=True, kw_only=True)
class LaunchStage(PropulsionStage):
    pass


@dataclass(slots=True, kw_only=True)
class KickStage(PropulsionStage):
    pass


@dataclass(slots=True, kw_only=True)
class SolarOberthCarrier(SpacecraftComponent):
    disposal_mode: str = "safe_orbit"


@dataclass(slots=True, kw_only=True)
class HeatShield(SpacecraftComponent):
    flux_limit_w_m2: float
    peak_flux_w_m2: float = 0.0

    def register_flux(self, flux_w_m2: float) -> bool:
        self.peak_flux_w_m2 = max(self.peak_flux_w_m2, flux_w_m2)
        return self.attached and flux_w_m2 <= self.flux_limit_w_m2


@dataclass(slots=True, kw_only=True)
class PayloadProbe(SpacecraftComponent):
    power_mode: PowerMode = PowerMode.SAFE
    separated: bool = False

    def commission(self) -> None:
        self.separated = True
        self.active = True
        self.power_mode = PowerMode.COMMISSIONING


@dataclass(slots=True, kw_only=True)
class EndMass:
    identifier: str
    enabled: bool = True
    temperature_sensor: bool = False
    tension_sensor: bool = False
    vibration_sensor: bool = False
    plasma_sensor: bool = False


@dataclass(slots=True, kw_only=True)
class Tether:
    identifier: str
    target_length_km: float
    end_mass: EndMass
    deployed_length_km: float = 0.0
    spool_locked: bool = True
    intact: bool = True

    @property
    def deployed(self) -> bool:
        return self.deployed_length_km >= self.target_length_km

    def unlock(self) -> None:
        self.spool_locked = False

    def deploy_step(self, length_km: float) -> float:
        if self.spool_locked or not self.intact:
            return self.deployed_length_km
        self.deployed_length_km = min(
            self.target_length_km,
            self.deployed_length_km + max(0.0, length_km),
        )
        if self.deployed:
            self.spool_locked = True
        return self.deployed_length_km


@dataclass(slots=True, kw_only=True)
class InstrumentedTether(Tether):
    fiber_communication: bool = True
    sensor_node_enabled: bool = True


@dataclass(slots=True, kw_only=True)
class ElectricSail(SpacecraftComponent):
    tethers: list[Tether] = field(default_factory=list)
    voltage_kv: float = 0.0
    spin_rate_rpm: float = 0.0
    structure_stable: bool = False
    high_voltage_active: bool = False

    @classmethod
    def build(
        cls,
        *,
        tether_count: int,
        instrumented_tether_count: int,
        tether_length_km: float,
        voltage_kv: float,
        spin_rate_rpm: float,
        end_masses_enabled: bool,
        fiber_communication_enabled: bool,
        sensor_nodes_enabled: bool,
    ) -> "ElectricSail":
        if tether_count < 1 or not 0 <= instrumented_tether_count <= tether_count:
            raise ValueError("Die Anzahl instrumentierter Tethers ist ungültig.")
        tethers: list[Tether] = []
        for index in range(tether_count):
            instrumented = index < instrumented_tether_count
            end_mass = EndMass(
                identifier=f"EM-{index + 1:03d}",
                enabled=end_masses_enabled,
                temperature_sensor=instrumented and sensor_nodes_enabled,
                tension_sensor=instrumented and sensor_nodes_enabled,
                vibration_sensor=instrumented and sensor_nodes_enabled,
                plasma_sensor=instrumented and sensor_nodes_enabled,
            )
            tether_type = InstrumentedTether if instrumented else Tether
            arguments = {
                "identifier": f"T-{index + 1:03d}",
                "target_length_km": tether_length_km,
                "end_mass": end_mass,
            }
            if instrumented:
                arguments.update(
                    fiber_communication=fiber_communication_enabled,
                    sensor_node_enabled=sensor_nodes_enabled,
                )
            tethers.append(tether_type(**arguments))
        return cls(
            name="Electric Sail",
            dry_mass_kg=0.0,
            tethers=tethers,
            voltage_kv=voltage_kv,
            spin_rate_rpm=spin_rate_rpm,
        )

    @property
    def deployed_count(self) -> int:
        return sum(tether.deployed for tether in self.tethers)

    def deploy_batch(self, target_count: int) -> int:
        for tether in self.tethers[: max(0, min(target_count, len(self.tethers)))]:
            tether.unlock()
            tether.deploy_step(tether.target_length_km)
        self.structure_stable = self.deployed_count == len(self.tethers)
        return self.deployed_count

    def charge(self) -> None:
        if not self.attached or not self.structure_stable or self.spin_rate_rpm <= 0:
            raise RuntimeError("Das Electric Sail ist noch nicht stabil und kann nicht geladen werden.")
        self.high_voltage_active = True
        self.active = True


@dataclass(slots=True, kw_only=True)
class SatelliteState:
    position_km: Vector3
    velocity_km_s: Vector3
    timestamp_seconds: float = 0.0
    phase: MissionPhase = MissionPhase.INIT


@dataclass(slots=True, kw_only=True)
class Satellite:
    name: str
    state: SatelliteState
    payload: PayloadProbe
    carrier: SolarOberthCarrier
    heatshield: HeatShield
    kick_stage: KickStage
    electric_sail: ElectricSail
    launch_stage: LaunchStage | None = None
    event_log: list[str] = field(default_factory=list)

    @property
    def components(self) -> tuple[SpacecraftComponent, ...]:
        components: list[SpacecraftComponent] = [
            self.payload,
            self.carrier,
            self.heatshield,
            self.kick_stage,
            self.electric_sail,
        ]
        if self.launch_stage is not None:
            components.append(self.launch_stage)
        return tuple(components)

    @property
    def total_mass_kg(self) -> float:
        return sum(component.mass_kg for component in self.components)

    @property
    def active_stage(self) -> str:
        active = next((component.name for component in self.components if component.active), None)
        return active or "coast"

    def transition_to(self, phase: MissionPhase) -> None:
        self.state.phase = phase

    def perform_oberth_burn(self, requested_delta_v_km_s: float) -> tuple[float, float]:
        self.kick_stage.activate()
        return self.kick_stage.burn(requested_delta_v_km_s, self.total_mass_kg)

    def separate_payload(self) -> None:
        self.kick_stage.detach()
        self.heatshield.detach()
        self.carrier.detach()
        self.payload.commission()
