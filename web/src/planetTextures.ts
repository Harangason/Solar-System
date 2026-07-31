export const PLANET_TEXTURES: Record<string, string> = {
  mercury: '/assets/planets/mercury.jpg',
  venus: '/assets/planets/venus.jpg',
  earth: '/assets/planets/earth.jpg',
  mars: '/assets/planets/mars.jpg',
  jupiter: '/assets/planets/jupiter.jpg',
  saturn: '/assets/planets/saturn.jpg',
  uranus: '/assets/planets/uranus.jpg',
  neptune: '/assets/planets/neptune.jpg',
}

export function planetTextureUrl(planetId: string) {
  return PLANET_TEXTURES[planetId] ?? PLANET_TEXTURES.earth
}
