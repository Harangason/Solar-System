"""Domain models for propulsion systems used by mission solvers."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from math import sqrt
from typing import Any


G0_M_S2 = 9.80665

Vector = tuple[float, float, float]
State = tuple[Vector, Vector]


class PropulsionType(StrEnum):
    CHEMICAL = "chemical"
    SOLID_KICK_STAGE = "solid_kick_stage"
    SOLAR_OBERTH = "solar_oberth"
    ION = "ion"
    HALL = "hall"
    NUCLEAR_ELECTRIC = "nuclear_electric"
    NUCLEAR_THERMAL = "nuclear_thermal"
    SOLAR_SAIL = "solar_sail"
    ELECTRIC_SAIL = "electric_sail"
    MAGNETIC_SAIL = "magnetic_sail"
    FUSION = "fusion"
    ANTIMATTER = "antimatter"
    WARP = "warp"


class TechnologyReadiness(StrEnum):
    OPERATIONAL = "operational"
    DEMONSTRATED = "demonstrated"
    EXPERIMENTAL = "experimental"
    CONCEPTUAL = "conceptual"
    SPECULATIVE = "speculative"
    FICTIONAL = "fictional"


@dataclass(slots=True)
class SimulationEnvironment:
    phase: str
    distance_au: float
    solar_flux_w_m2: float
    solar_wind_factor: float
    power_available_w: float
    theoretical_mode: bool = False


@dataclass(slots=True)
class PropulsionResult:
    acceleration_vector_km_s2: Vector = (0.0, 0.0, 0.0)
    thrust_n: float = 0.0
    power_used_w: float = 0.0
    propellant_used_kg: float = 0.0
    heat_generated_w: float = 0.0
    warnings: list[str] = field(default_factory=list)


def _magnitude(vector: Vector) -> float:
    return sqrt(sum(value * value for value in vector))


def _normalize(vector: Vector) -> Vector:
    length = _magnitude(vector) or 1.0
    return tuple(value / length for value in vector)  # type: ignore[return-value]


def _direction(mode: str, state: State) -> Vector:
    position, velocity = state
    if mode == "retrograde":
        return tuple(-value for value in _normalize(velocity))  # type: ignore[return-value]
    if mode == "radial_out":
        return _normalize(position)
    if mode == "radial_in":
        return tuple(-value for value in _normalize(position))  # type: ignore[return-value]
    return _normalize(velocity)


@dataclass(slots=True)
class PropulsionModule:
    id: str
    name: str
    type: PropulsionType
    readiness: TechnologyReadiness
    enabled: bool
    dry_mass_kg: float
    propellant_mass_kg: float
    power_required_w: float
    direction_mode: str
    visual_mode: str
    visual_enabled: bool
    parameters: dict[str, Any]
    activation_phases: tuple[str, ...] = ()
    warnings: list[str] = field(default_factory=list)
    active_seconds: float = 0.0
    total_propellant_used_kg: float = 0.0
    delivered_delta_v_km_s: float = 0.0
    peak_thrust_n: float = 0.0

    def can_activate(self, state: State, environment: SimulationEnvironment) -> bool:
        if not self.enabled:
            return False
        if self.activation_phases and environment.phase not in self.activation_phases:
            return False
        minimum = float(self.parameters.get("minDistanceFromSunAU", 0.0))
        maximum = float(self.parameters.get("maxDistanceFromSunAU", float("inf")))
        return minimum <= environment.distance_au <= maximum

    def update(self, dt: float, state: State, environment: SimulationEnvironment, mass_kg: float) -> PropulsionResult:
        return PropulsionResult()

    def _thrust_result(
        self,
        dt: float,
        state: State,
        mass_kg: float,
        thrust_n: float,
        power_w: float = 0.0,
        specific_impulse_s: float | None = None,
        heat_w: float = 0.0,
        warnings: list[str] | None = None,
    ) -> PropulsionResult:
        warnings = list(warnings or [])
        if power_w > 0 and power_w > self.parameters.get("powerAvailableW", float("inf")):
            warnings.append("Antriebsleistung übersteigt die zugewiesene Leistung.")
        propellant = 0.0
        if specific_impulse_s and thrust_n > 0:
            requested_propellant = thrust_n / (specific_impulse_s * G0_M_S2) * dt
            propellant = min(self.propellant_mass_kg, requested_propellant)
            if propellant <= 0:
                return PropulsionResult(warnings=warnings + ["Treibstoff erschöpft."])
            if propellant < requested_propellant:
                thrust_n *= propellant / requested_propellant
                warnings.append("Schub durch verbleibenden Treibstoff begrenzt.")
            self.propellant_mass_kg -= propellant
            self.total_propellant_used_kg += propellant
        acceleration = thrust_n / max(mass_kg, 1e-9) / 1_000
        vector = tuple(value * acceleration for value in _direction(self.direction_mode, state))
        self.active_seconds += dt
        self.peak_thrust_n = max(self.peak_thrust_n, thrust_n)
        self.delivered_delta_v_km_s += acceleration * dt
        return PropulsionResult(vector, thrust_n, power_w, propellant, heat_w, warnings)  # type: ignore[arg-type]

    def report(self) -> dict:
        risk = "low" if self.readiness in {TechnologyReadiness.OPERATIONAL, TechnologyReadiness.DEMONSTRATED} else "high"
        if self.readiness in {TechnologyReadiness.SPECULATIVE, TechnologyReadiness.FICTIONAL}:
            risk = "unresolved"
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type.value,
            "readiness": self.readiness.value,
            "enabled": self.enabled,
            "activeSeconds": self.active_seconds,
            "peakThrustN": self.peak_thrust_n,
            "powerRequiredW": self.power_required_w,
            "propellantUsedKg": self.total_propellant_used_kg,
            "propellantRemainingKg": self.propellant_mass_kg,
            "deltaVDeliveredKmS": self.delivered_delta_v_km_s,
            "dryMassKg": self.dry_mass_kg,
            "risk": risk,
            "visualMode": self.visual_mode,
            "visualEnabled": self.visual_enabled,
            "parameters": self.parameters,
            "warnings": list(dict.fromkeys(self.warnings)),
        }


class ImpulsiveModule(PropulsionModule):
    """Reported here but executed by the mission's discrete burn sequence."""


class ElectricThrusterModule(PropulsionModule):
    def update(self, dt: float, state: State, environment: SimulationEnvironment, mass_kg: float) -> PropulsionResult:
        if not self.can_activate(state, environment):
            return PropulsionResult()
        if environment.power_available_w < self.power_required_w:
            warning = "Elektrischer Antrieb ohne ausreichende elektrische Leistung."
            self.warnings.append(warning)
            return PropulsionResult(warnings=[warning])
        return self._thrust_result(
            dt, state, mass_kg,
            float(self.parameters.get("thrustN", 0.25)),
            self.power_required_w,
            float(self.parameters.get("specificImpulseS", 3_000.0)),
            self.power_required_w * 0.25,
        )


class NuclearElectricModule(PropulsionModule):
    @property
    def electric_output_w(self) -> float:
        return float(self.parameters.get("reactorPowerW", 0.0)) * float(self.parameters.get("electricEfficiency", 0.35))

    def can_activate(self, state: State, environment: SimulationEnvironment) -> bool:
        active = super().can_activate(state, environment)
        if active and float(self.parameters.get("radiatorAreaM2", 0.0)) <= 0:
            self.warnings.append("Nuklear-elektrisches System benötigt Radiatorfläche.")
            return False
        return active


class SolarSailModule(PropulsionModule):
    def update(self, dt: float, state: State, environment: SimulationEnvironment, mass_kg: float) -> PropulsionResult:
        if not self.can_activate(state, environment):
            return PropulsionResult()
        if not self.parameters.get("deployed", False):
            warning = "Solarsegel aktiv, aber nicht entfaltet."
            self.warnings.append(warning)
            return PropulsionResult(warnings=[warning])
        thermal_limit = float(self.parameters.get("thermalLimitWm2", 100_000.0))
        warnings = ["Thermische Belastungsgrenze des Solarsegel überschritten."] if environment.solar_flux_w_m2 > thermal_limit else []
        thrust = 9.08e-6 * float(self.parameters.get("sailAreaM2", 1_000.0)) \
            * float(self.parameters.get("reflectivity", 1.0)) / max(environment.distance_au**2, 0.01)
        return self._thrust_result(dt, state, mass_kg, thrust, warnings=warnings)


class ElectricSailPropulsionModule(PropulsionModule):
    def update(self, dt: float, state: State, environment: SimulationEnvironment, mass_kg: float) -> PropulsionResult:
        if not self.can_activate(state, environment):
            return PropulsionResult()
        deployed = bool(self.parameters.get("deployed", False))
        charged = bool(self.parameters.get("charged", False))
        if charged and not deployed:
            warning = "Electric Sail kann nicht geladen werden, bevor die Tethers entfaltet wurden."
            self.warnings.append(warning)
            return PropulsionResult(warnings=[warning])
        if not deployed or not charged:
            return PropulsionResult()
        count = int(self.parameters.get("totalTetherCount", 80))
        length_km = float(self.parameters.get("tetherLengthKm", 30.0))
        voltage_kv = float(self.parameters.get("tetherVoltageKV", 20.0))
        thrust = (count * length_km / 2_000.0) * (voltage_kv / 20.0) \
            * environment.solar_wind_factor / max(environment.distance_au, 0.1)
        power = float(self.parameters.get("electronGunPowerW", 700.0))
        if environment.power_available_w < power:
            warning = "Electric Sail kann ohne Elektronenkanonen-Leistung nicht geladen bleiben."
            self.warnings.append(warning)
            return PropulsionResult(warnings=[warning])
        return self._thrust_result(dt, state, mass_kg, thrust, power)


class NuclearThermalModule(PropulsionModule):
    def update(self, dt: float, state: State, environment: SimulationEnvironment, mass_kg: float) -> PropulsionResult:
        if not self.can_activate(state, environment):
            return PropulsionResult()
        remaining_burn = float(self.parameters.get("burnDurationS", 0.0)) - self.active_seconds
        if remaining_burn <= 0:
            return PropulsionResult()
        return self._thrust_result(
            min(dt, remaining_burn), state, mass_kg,
            float(self.parameters.get("thrustN", 200_000.0)),
            specific_impulse_s=float(self.parameters.get("specificImpulseS", 900.0)),
        )


class ConceptThrustModule(PropulsionModule):
    def update(self, dt: float, state: State, environment: SimulationEnvironment, mass_kg: float) -> PropulsionResult:
        if not self.can_activate(state, environment):
            return PropulsionResult()
        if self.type == PropulsionType.ANTIMATTER and float(self.parameters.get("containmentPowerW", 0.0)) <= 0:
            warning = "Antimaterie-Antrieb ohne Containment-Leistung ist unzulässig."
            self.warnings.append(warning)
            return PropulsionResult(warnings=[warning])
        if not environment.theoretical_mode:
            warning = f"{self.name} ist nur im theoretischen Szenariomodus berechenbar."
            self.warnings.append(warning)
            return PropulsionResult(warnings=[warning])
        return self._thrust_result(
            dt, state, mass_kg,
            float(self.parameters.get("thrustN", 0.0)),
            float(self.parameters.get("powerRequiredW", self.power_required_w)),
            float(self.parameters.get("specificImpulseS", 0.0)) or None,
            warnings=["Theoretisches Modell – keine operationale Technologie."],
        )


class WarpVisualModule(PropulsionModule):
    def update(self, dt: float, state: State, environment: SimulationEnvironment, mass_kg: float) -> PropulsionResult:
        if not self.enabled:
            return PropulsionResult()
        warning = "HYPOTHETISCH: Warp-Antrieb ist reine Visualisierung und verändert keine Newtonsche Flugbahn."
        self.warnings.append(warning)
        return PropulsionResult(warnings=[warning])


MODULE_CLASSES = {
    PropulsionType.CHEMICAL: ImpulsiveModule,
    PropulsionType.SOLID_KICK_STAGE: ImpulsiveModule,
    PropulsionType.SOLAR_OBERTH: ImpulsiveModule,
    PropulsionType.ION: ElectricThrusterModule,
    PropulsionType.HALL: ElectricThrusterModule,
    PropulsionType.NUCLEAR_ELECTRIC: NuclearElectricModule,
    PropulsionType.NUCLEAR_THERMAL: NuclearThermalModule,
    PropulsionType.SOLAR_SAIL: SolarSailModule,
    PropulsionType.ELECTRIC_SAIL: ElectricSailPropulsionModule,
    PropulsionType.MAGNETIC_SAIL: ConceptThrustModule,
    PropulsionType.FUSION: ConceptThrustModule,
    PropulsionType.ANTIMATTER: ConceptThrustModule,
    PropulsionType.WARP: WarpVisualModule,
}


def default_propulsion_modules() -> list[dict]:
    return [
        _module("chemical", "Chemischer Antrieb", "operational", True, 400, 0, "engine_plume", {"thrustN": 800_000, "specificImpulseS": 450}),
        _module("solid_kick_stage", "Feststoff-/Kick-Stufe", "operational", True, 300, 7_200, "burn_marker", {"thrustN": 1_000_000, "specificImpulseS": 450}),
        _module("solar_oberth", "Solar-Oberth-Manöver", "demonstrated", True, 0, 0, "burn_marker", {"targetPerihelionAU": 0.05, "burnDeltaVKmS": 8, "burnDurationS": 240, "heatshieldRequired": True}),
        _module("ion", "Ionenantrieb", "operational", False, 120, 120, "engine_plume", {"thrustN": 0.25, "specificImpulseS": 4_000, "powerRequiredW": 7_000, "propellantType": "xenon"}),
        _module("hall", "Hall-Antrieb", "operational", False, 140, 180, "engine_plume", {"thrustN": 0.4, "specificImpulseS": 2_000, "powerRequiredW": 12_000, "propellantType": "krypton"}),
        _module("nuclear_electric", "Nuklear-elektrisch", "demonstrated", False, 1_200, 0, "none", {"reactorPowerW": 200_000, "electricEfficiency": 0.35, "radiatorAreaM2": 180, "thermalWasteW": 130_000}),
        _module("nuclear_thermal", "Nuklear-thermisch", "experimental", False, 2_500, 2_000, "engine_plume", {"thrustN": 200_000, "specificImpulseS": 900, "burnDurationS": 600}),
        _module("solar_sail", "Solarsegel", "demonstrated", False, 50, 0, "sail_surface", {"sailAreaM2": 1_000, "reflectivity": 1.8, "deployed": True, "deploymentProgress": 1, "thermalLimitWm2": 100_000}),
        _module("electric_sail", "Electric Sail", "experimental", True, 80, 0, "electric_tethers", {"totalTetherCount": 80, "instrumentedTetherCount": 16, "tetherLengthKm": 30, "effectiveDiameterKm": 60, "tetherVoltageKV": 20, "spinRateRpm": 1, "tetherMaterial": "aluminium", "deployed": False, "charged": False, "deploymentProgress": 0, "showSensorTethers": True, "showOpticalFibers": True, "endMassKg": 0.5, "electronGunPowerW": 700, "simplifiedThrustMode": True}),
        _module("magnetic_sail", "Magnet-/Plasmasegel", "conceptual", False, 500, 0, "magnetic_field", {"loopRadiusKm": 50, "magneticFieldStrengthT": 0.01, "superconducting": True, "powerRequiredW": 50_000, "thrustN": 0.2}),
        _module("fusion", "Fusion Drive", "conceptual", False, 8_000, 5_000, "engine_plume", {"reactorPowerW": 1e9, "exhaustVelocityKmS": 10_000, "thrustN": 2_000, "specificImpulseS": 1_000_000, "fusionMode": "deuterium_helium3"}),
        _module("antimatter", "Antimaterie-Antrieb", "speculative", False, 3_000, 0.001, "engine_plume", {"antimatterMassMg": 1, "conversionEfficiency": 0.1, "containmentPowerW": 1e6, "thrustN": 5_000, "specificImpulseS": 10_000_000}),
        _module("warp", "Warp :-)", "fictional", False, 0, 0, "warp_bubble", {"warpFactor": 1, "bubbleRadiusKm": 1_000, "exoticEnergyRequirement": 1e45, "visualizationOnly": True}),
    ]


def _module(module_type: str, name: str, readiness: str, enabled: bool, dry_mass: float, propellant: float, visual: str, parameters: dict) -> dict:
    return {
        "id": module_type,
        "name": name,
        "type": module_type,
        "readiness": readiness,
        "enabled": enabled,
        "active": False,
        "dryMassKg": dry_mass,
        "propellantMassKg": propellant,
        "powerRequiredW": float(parameters.get("powerRequiredW", 0.0)),
        "directionMode": "radial_out" if module_type in {"solar_sail", "electric_sail", "magnetic_sail"} else "prograde",
        "visualMode": visual,
        "visualEnabled": True,
        "parameters": parameters,
        "warnings": [],
    }


def build_propulsion_modules(configurations: list[dict]) -> list[PropulsionModule]:
    modules: list[PropulsionModule] = []
    for config in configurations:
        propulsion_type = PropulsionType(config["type"])
        module_class = MODULE_CLASSES[propulsion_type]
        parameters = dict(config.get("parameters") or {})
        modules.append(module_class(
            id=str(config.get("id", propulsion_type.value)),
            name=str(config.get("name", propulsion_type.value)),
            type=propulsion_type,
            readiness=TechnologyReadiness(config.get("readiness", "conceptual")),
            enabled=bool(config.get("enabled", False)),
            dry_mass_kg=float(config.get("dryMassKg", 0.0)),
            propellant_mass_kg=float(config.get("propellantMassKg", 0.0)),
            power_required_w=float(config.get("powerRequiredW", parameters.get("powerRequiredW", 0.0))),
            direction_mode=str(config.get("directionMode", "prograde")),
            visual_mode=str(config.get("visualMode", "none")),
            visual_enabled=bool(config.get("visualEnabled", True)),
            parameters=parameters,
            activation_phases=tuple(config.get("activationPhase") or ("ELECTRIC_SAIL_PROPULSION", "DEEP_SPACE_CRUISE")),
        ))
    return modules


class PropulsionSystem:
    def __init__(self, modules: list[PropulsionModule], theoretical_mode: bool = False):
        self.modules = modules
        self.theoretical_mode = theoretical_mode
        self.warnings: list[str] = []

    def module(self, module_type: PropulsionType) -> PropulsionModule | None:
        return next((module for module in self.modules if module.type == module_type), None)

    def update(self, dt: float, state: State, environment: SimulationEnvironment, mass_kg: float) -> PropulsionResult:
        reactor_power = sum(
            module.electric_output_w
            for module in self.modules
            if isinstance(module, NuclearElectricModule) and module.enabled and module.can_activate(state, environment)
        )
        environment.power_available_w += reactor_power
        environment.theoretical_mode = self.theoretical_mode
        total = PropulsionResult()
        remaining_power = environment.power_available_w
        for module in self.modules:
            module.parameters["powerAvailableW"] = remaining_power
            result = module.update(dt, state, environment, mass_kg)
            total.acceleration_vector_km_s2 = tuple(
                total.acceleration_vector_km_s2[index] + result.acceleration_vector_km_s2[index]
                for index in range(3)
            )  # type: ignore[assignment]
            total.thrust_n += result.thrust_n
            total.power_used_w += result.power_used_w
            total.propellant_used_kg += result.propellant_used_kg
            total.heat_generated_w += result.heat_generated_w
            total.warnings.extend(result.warnings)
            remaining_power = max(0.0, remaining_power - result.power_used_w)
        self.warnings.extend(total.warnings)
        return total

    def reports(self) -> list[dict]:
        return [module.report() for module in self.modules]
