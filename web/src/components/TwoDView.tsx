export function TwoDView() {
  return (
    <section className="view-panel" aria-labelledby="two-d-title">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Python · Matplotlib</p>
          <h1 id="two-d-title">Das Sonnensystem in 2D</h1>
        </div>
        <p>Die Grafik wird bei jedem Aufruf serverseitig aus denselben Python-Objekten wie das 3D-Modell erzeugt.</p>
      </div>
      <div className="plot-frame">
        <img src="/api/view/2d" alt="Matplotlib-Darstellung der Sonne und aller acht Planeten" />
      </div>
    </section>
  )
}
