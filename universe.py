
from abc import ABC, abstractmethod

from scipy import constants


EARTH_ORBIT_RADIUS_M = constants.astronomical_unit
MOON_ORBIT_RADIUS_M = 384_400 * constants.kilo
EARTH_ORBIT_RADIUS_AU = EARTH_ORBIT_RADIUS_M / constants.astronomical_unit
MOON_ORBIT_RADIUS_KM = MOON_ORBIT_RADIUS_M / constants.kilo


class CelestialBody(ABC):
    def __init__(self, name, mass, radius, mean_temperature=None, age_in_years=None, host=None):
        self.name = name
        self.mass_in_kg = mass  # in kilograms
        self.radius_in_meters = radius  # in meters
        self.mean_temperature_in_kelvin = mean_temperature
        self.age_in_years = age_in_years
        self.host = host

    def surface_gravity(self):
        return constants.G * self.mass_in_kg / (self.radius_in_meters ** 2)

    @abstractmethod
    def get_host(self):
        pass
    
class Planet(CelestialBody):
    def __init__(
        self,
        name,
        mass,
        radius,
        mean_temperature=None,
        age_in_years=None,
        host_star=None,
        orbital_distance_au=None,
        orbital_period_days=None,
        color="#ffffff",
        has_rings=False,
        planet_id=None,
    ):
        super().__init__(name, mass, radius, mean_temperature, age_in_years)
        self.host_star = host_star  # Reference to the host star object
        self.orbital_distance_au = orbital_distance_au
        self.orbital_period_days = orbital_period_days
        self.color = color
        self.has_rings = has_rings
        self.planet_id = planet_id or name.lower()

    def get_host(self):
        return self.host_star

    def surface_gravity(self):
        return constants.G * self.mass_in_kg / (self.radius_in_meters ** 2)

    def calculate_mean_temperature(self):
        # Placeholder implementation - replace with actual temperature calculation if needed
        return 0

    def calculate_age(self):
        # Placeholder implementation - replace with actual age calculation if needed
        return 0
    
    

    def __str__(self):
        return f"Planet {self.name}: Mass = {self.mass_in_kg} kg, Radius = {self.radius_in_meters} m, Surface Gravity = {self.surface_gravity()} m/s^2, Mean Temperature = {self.mean_temperature_in_kelvin} K, Age = {self.age_in_years} years, Host Star = {self.host_star.name}"
       
class Moon(CelestialBody):
    def __init__(self, name, mass, radius, host_planet, mean_temperature=None, age_in_years=None):
        super().__init__(name, mass, radius, mean_temperature, age_in_years)
        self.host_planet = host_planet  # Reference to the host planet object

    def get_host(self):
        return self.host_planet


    def surface_gravity(self):
        return constants.G * self.mass_in_kg / (self.radius_in_meters ** 2)

    def calculate_mean_temperature(self):
        # Placeholder implementation - replace with actual temperature calculation if needed
        return 0

    def calculate_age(self):
        # Placeholder implementation - replace with actual age calculation if needed
        return 0

    def __str__(self):
        return f"Moon {self.name}: Mass = {self.mass_in_kg} kg, Radius = {self.radius_in_meters} m, Surface Gravity = {self.surface_gravity()} m/s^2, Mean Temperature = {self.mean_temperature_in_kelvin} K, Age = {self.age_in_years} years, Host Planet = {self.host_planet.name}"
    
class Star(CelestialBody):
        
    def __init__(self, name, mass, radius, luminosity, host_galaxy=None, age_in_years=None, surrounding_planets=None):
        super().__init__(name, mass, radius, mean_temperature=None, age_in_years=age_in_years)
        self.luminosity_in_watts = luminosity  # in watts
        self.surrounding_planets = surrounding_planets if surrounding_planets is not None else []  # List of Planet objects
        self.host_galaxy = host_galaxy  # Reference to the host galaxy object

    def get_host(self):
        return self.host_galaxy

    def surface_gravity(self):
        return constants.G * self.mass_in_kg / (self.radius_in_meters ** 2)

    def __str__(self):
        return f"Star {self.name}: Mass = {self.mass_in_kg} kg, Radius = {self.radius_in_meters} m, Luminosity = {self.luminosity_in_watts} W, Surface Gravity = {self.surface_gravity()} m/s^2"
 
