import type { MoonData, PlanetData } from '../types'

interface TwoDPlanetDetailsProps {
  planet: PlanetData
  planets: PlanetData[]
  moons: MoonData[]
  epochLabel: string
  onPlanetChange: (planetId: string) => void
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits }).format(value)
}

export function TwoDPlanetDetails({
  planet,
  planets,
  moons,
  epochLabel,
  onPlanetChange,
}: TwoDPlanetDetailsProps) {
  return (
    <aside className="two-d-planet-details" aria-labelledby="two-d-planet-title">
      <header>
        <span className="planet-detail-color" style={{ backgroundColor: planet.color }} aria-hidden="true" />
        <div className="planet-detail-heading">
          <small>Ausgewähltes Objekt · {epochLabel}</small>
          <h2 id="two-d-planet-title">{planet.name}</h2>
          <label className="planet-detail-selector">
            <span className="visually-hidden">Planet auswählen</span>
            <select
              aria-label="Planet auswählen"
              value={planet.id}
              onChange={(event) => onPlanetChange(event.target.value)}
            >
              {planets.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <dl>
        <div><dt>Sonnenabstand</dt><dd>{formatNumber(planet.distanceAu, 4)} AE</dd></div>
        <div><dt>Radius</dt><dd>{formatNumber(planet.radiusKm, 0)} km</dd></div>
        <div><dt>Masse</dt><dd>{planet.massKg.toExponential(3).replace('.', ',')} kg</dd></div>
        <div><dt>Umlaufzeit</dt><dd>{formatNumber(planet.orbitalPeriodDays, 1)} Tage</dd></div>
        <div><dt>Exzentrizität</dt><dd>{formatNumber(planet.eccentricity ?? 0, 4)}</dd></div>
        <div><dt>Bahnneigung</dt><dd>{formatNumber(planet.inclinationDeg ?? 0, 2)}°</dd></div>
        <div><dt>Schwerkraft</dt><dd>{formatNumber(planet.surfaceGravity, 2)} m/s²</dd></div>
        <div><dt>Temperatur</dt><dd>{formatNumber(planet.temperatureK, 0)} K</dd></div>
        <div><dt>Ringsystem</dt><dd>{planet.hasRings ? 'Ja' : 'Nein'}</dd></div>
      </dl>

      <section className="two-d-moon-section" aria-labelledby="two-d-moons-title">
        <div className="moon-section-heading">
          <h3 id="two-d-moons-title">Monde</h3>
          <span>{moons.length}</span>
        </div>
        {moons.length > 0
          ? (
            <ul>
              {moons.map((moon) => (
                <li key={moon.id}>
                  <strong>{moon.name}</strong>
                  <small>
                    {moon.semiMajorAxisKm
                      ? `${formatNumber(moon.semiMajorAxisKm, 0)} km · ${formatNumber(moon.orbitalPeriodDays ?? 0, 2)} d`
                      : moon.provisionalDesignation ?? 'Katalogeintrag'}
                  </small>
                </li>
              ))}
            </ul>
          )
          : <p>Keine bekannten Monde.</p>}
      </section>
    </aside>
  )
}
