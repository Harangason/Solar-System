import { lazy, Suspense, useState } from 'react'

const TwoDView = lazy(() => import('./components/TwoDView').then(({ TwoDView }) => ({ default: TwoDView })))
const ThreeDView = lazy(() => import('./components/ThreeDView').then(({ ThreeDView }) => ({ default: ThreeDView })))

type ViewMode = 'menu' | '2d' | '3d'

export function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('menu')

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setViewMode('menu')}>
          <span className="brand-mark" aria-hidden="true" />
          Unser Sonnensystem
        </button>
        {viewMode !== 'menu' && (
          <nav className="view-switcher" aria-label="Darstellung wechseln">
            <button className={viewMode === '2d' ? 'active' : ''} type="button" onClick={() => setViewMode('2d')}>
              2D
            </button>
            <button className={viewMode === '3d' ? 'active' : ''} type="button" onClick={() => setViewMode('3d')}>
              3D
            </button>
          </nav>
        )}
      </header>

      {viewMode === 'menu' ? (
        <section className="chooser" aria-labelledby="chooser-title">
          <p className="eyebrow">Interaktive Expedition</p>
          <h1 id="chooser-title">Wie möchtest du das Sonnensystem erkunden?</h1>
          <p className="intro">Wähle die wissenschaftliche 2D-Übersicht oder fliege frei durch das 3D-Modell.</p>
          <div className="choice-grid">
            <button className="choice-card choice-2d" type="button" onClick={() => setViewMode('2d')}>
              <span className="choice-number">01</span>
              <strong>Matplotlib 2D</strong>
              <span>Alle acht Planeten in einer klaren, datenbasierten Übersicht.</span>
            </button>
            <button className="choice-card choice-3d" type="button" onClick={() => setViewMode('3d')}>
              <span className="choice-number">02</span>
              <strong>Interaktiv 3D</strong>
              <span>Drehen, zoomen und Planeten auswählen – mit React Three Fiber.</span>
            </button>
          </div>
        </section>
      ) : (
        <Suspense fallback={<div className="loading">Ansicht wird geladen …</div>}>
          {viewMode === '2d' ? <TwoDView /> : <ThreeDView />}
        </Suspense>
      )}
    </main>
  )
}
