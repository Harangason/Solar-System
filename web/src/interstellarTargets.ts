export interface InterstellarTarget {
  id: string
  name: string
  distanceLy: number
  rightAscensionDeg: number
  declinationDeg: number
  spectralType: string
  kind: 'stellar-system' | 'galactic-center'
  color: string
  knownExoplanetSystem?: boolean
}

// Approximate J2000 equatorial directions and catalog distances. Distances of
// nearby systems follow the NASA/NIAC nearest-star map; Sgr A* uses NASA's
// rounded 26,000 light-year distance for the Galactic Center.
export const INTERSTELLAR_TARGETS: InterstellarTarget[] = [
  { id: 'proxima-centauri', name: 'Proxima Centauri', distanceLy: 4.22, rightAscensionDeg: 217.43, declinationDeg: -62.68, spectralType: 'M5.5 V', kind: 'stellar-system', color: '#ff8a68', knownExoplanetSystem: true },
  { id: 'alpha-centauri', name: 'Alpha Centauri A/B', distanceLy: 4.39, rightAscensionDeg: 219.90, declinationDeg: -60.83, spectralType: 'G2 V + K1 V', kind: 'stellar-system', color: '#ffd88a' },
  { id: 'barnards-star', name: 'Barnards Stern', distanceLy: 5.96, rightAscensionDeg: 269.45, declinationDeg: 4.74, spectralType: 'M4 V', kind: 'stellar-system', color: '#ff765e' },
  { id: 'wolf-359', name: 'Wolf 359', distanceLy: 7.86, rightAscensionDeg: 164.12, declinationDeg: 7.01, spectralType: 'M6 V', kind: 'stellar-system', color: '#ff614f' },
  { id: 'lalande-21185', name: 'Lalande 21185', distanceLy: 8.31, rightAscensionDeg: 165.83, declinationDeg: 35.97, spectralType: 'M2 V', kind: 'stellar-system', color: '#ff9472' },
  { id: 'sirius', name: 'Sirius A/B', distanceLy: 8.60, rightAscensionDeg: 101.29, declinationDeg: -16.72, spectralType: 'A1 V + DA2', kind: 'stellar-system', color: '#d7e8ff' },
  { id: 'luyten-726-8', name: 'Luyten 726-8 / UV Ceti', distanceLy: 8.73, rightAscensionDeg: 24.76, declinationDeg: -17.95, spectralType: 'M5.5 V + M6 V', kind: 'stellar-system', color: '#ff7258' },
  { id: 'ross-154', name: 'Ross 154', distanceLy: 9.69, rightAscensionDeg: 270.16, declinationDeg: -23.84, spectralType: 'M3.5 V', kind: 'stellar-system', color: '#ff8062' },
  { id: 'ross-248', name: 'Ross 248', distanceLy: 10.30, rightAscensionDeg: 355.48, declinationDeg: 44.18, spectralType: 'M5.5 V', kind: 'stellar-system', color: '#ff6b54' },
  { id: 'epsilon-eridani', name: 'Epsilon Eridani', distanceLy: 10.50, rightAscensionDeg: 53.23, declinationDeg: -9.46, spectralType: 'K2 V', kind: 'stellar-system', color: '#ffc477', knownExoplanetSystem: true },
  { id: 'ross-128', name: 'Ross 128', distanceLy: 11.03, rightAscensionDeg: 176.94, declinationDeg: 0.80, spectralType: 'M4 V', kind: 'stellar-system', color: '#ff8066', knownExoplanetSystem: true },
  { id: 'trappist-1', name: 'TRAPPIST-1', distanceLy: 40.66, rightAscensionDeg: 346.62, declinationDeg: -5.04, spectralType: 'M8 V', kind: 'stellar-system', color: '#ff5b48', knownExoplanetSystem: true },
  { id: '55-cancri', name: '55 Cancri', distanceLy: 41.00, rightAscensionDeg: 133.15, declinationDeg: 28.33, spectralType: 'K0 IV-V', kind: 'stellar-system', color: '#ffc98a', knownExoplanetSystem: true },
  { id: 'milky-way-center', name: 'Milchstraßenzentrum / Sgr A*', distanceLy: 26_000, rightAscensionDeg: 266.42, declinationDeg: -29.01, spectralType: 'Galaktischer Kern', kind: 'galactic-center', color: '#d993ff' },
]

export const EXOPLANET_SYSTEMS = INTERSTELLAR_TARGETS.filter((target) => target.knownExoplanetSystem)

// Route planning also needs Alpha Centauri as a directional destination even
// though no confirmed planet is required for an interstellar asymptote.
export const ROUTE_INTERSTELLAR_SYSTEMS = INTERSTELLAR_TARGETS.filter(
  (target) => target.knownExoplanetSystem || target.id === 'alpha-centauri',
)

