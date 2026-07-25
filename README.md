# Solar System Mission Simulator

Technisch-physikalische Missionssimulation fuer heliozentrische Flugbahnen,
Solar-Oberth-Manoever, elektrische Segel und planetare Swing-by-Routen.

Die Anwendung kombiniert einen Flask-Backend-Service mit einer React/Three.js
Oberflaeche. Die physikalische Rechenkette liegt hauptsaechlich in Python; das
Frontend nutzt dieselben Bahnparameter fuer Visualisierung, Parametereingabe und
Missionsauswertung.

![Solar-Oberth model](docs/assets/solar-oberth-model.png)

## Hinweis zur Entwicklung

**Deutsch:** Dieses Projekt befindet sich in aktiver Entwicklung; die
Kernfunktionalitaet fuer die Simulation von Missionen ist nutzbar, waehrend
Fehlerbehandlung, Stabilitaet und UX weiter verfeinert werden.

**English:** The project is under active development; the mission simulation
core is already usable, while error handling, stability, and UX are actively
being improved.

## Wer sollte das Projekt nutzen?

Dieses Projekt richtet sich an Lernende und Entwickler, die OOP-Konzepte anhand
eines praxisnahen Beispiels fuer Raumfahrt-Missionsimulation und -Optimierung
praktisch anwenden wollen.

## Zielsetzung

Ziel des Projekts ist die didaktische Demonstration von Vererbung,
Polymorphismus und Abstraktion in einer webbasierten Simulation von Missionen
von der Datenerfassung bis zur Visualisierung. Die technische Dokumentation
ergaenzt diese didaktische Ebene um die konkret verwendeten Gleichungen,
Grenzwertbetrachtungen und Modellgrenzen.

## Ueberblick

Die App bildet eine lokale Umgebung zur Simulation von Missionen mit Bahn- und
Routenberechnung sowie 2D/3D-Visualisierung auf.

## Modellumfang

- Heliozentrisches, ekliptikales, kartesisches Bezugssystem.
- Positionen in `km`, Geschwindigkeiten in `km/s`, Zeiten in `s` bzw. Tagen.
- Planetenpositionen aus vereinfachten J2000-Orbitalelementen.
- Sonnenzentrierte Zwei-Koerper-Dynamik mit optionalen planetaren Stoertermen.
- RK4-Integration fuer die Solar-Oberth-Missionsbahn.
- Lambert-Randwertloesung fuer Wegpunkt-Transfers.
- Patched-Conic-Swing-by mit Einflusssphaere, Hyperbel und Zielasymptote.
- Modulare Antriebsmodelle fuer impulsive Burns, Solar Sail, Electric Sail,
  elektrische Triebwerke und theoretische Konzepte.

## Zentrale Konstanten und Notation

| Groesse | Symbol | Wert / Quelle | Code |
| --- | --- | --- | --- |
| Astronomische Einheit | $1\,\mathrm{AU}$ | `149597870.7 km` | `trajectory.AU_KM`, `web/src/missionSimulation.ts` |
| Sonnen-Gravitationsparameter | $\mu_\odot$ | `1.32712440018e11 km^3/s^2` | `trajectory.MU_SUN` |
| Erd-Gravitationsparameter | $\mu_\oplus$ | `398600.4418 km^3/s^2` | `trajectory.MU_EARTH` |
| Erdradius | $R_\oplus$ | `6378.137 km` | `trajectory.EARTH_RADIUS_KM` |
| Solarkonstante bei 1 AU | $S_0$ | `1361 W/m^2` | `trajectory.SOLAR_CONSTANT_W_M2` |
| Normfallbeschleunigung | $g_0$ | `9.80665 m/s^2` | `propulsion.G0_M_S2`, `satellite.G0_KM_S2` |

Notation:

| Symbol | Bedeutung |
| --- | --- |
| $\mathbf r$ | heliozentrischer Ortsvektor |
| $\mathbf v$ | heliozentrischer Geschwindigkeitsvektor |
| $r=\|\mathbf r\|$ | Sonnenabstand |
| $\hat{\mathbf r}=\mathbf r/r$ | radialer Einheitsvektor |
| $\hat{\mathbf v}=\mathbf v/\|\mathbf v\|$ | tangentialer Einheitsvektor in Bewegungsrichtung |
| $\Delta t$ | Integrations- oder Flugzeitintervall |
| $\Delta v$ | impulsive Geschwindigkeitsaenderung |
| $a,e,i,\Omega,\omega,M$ | klassische Bahnelemente: grosse Halbachse, Exzentrizitaet, Inklination, Knotenlaenge, Argument des Perihels, mittlere Anomalie |

## Dynamikgleichung

<img src="docs/assets/formulas/state-dynamics-rk4.svg" alt="State-space dynamics and RK4 propagation" width="780">

Die Missionsbahn wird als Anfangswertproblem erster Ordnung formuliert. Der
Zustandsvektor lautet:

$$
\mathbf x(t)
=
\begin{bmatrix}
\mathbf r(t) \\
\mathbf v(t)
\end{bmatrix}
$$

Damit gilt allgemein:

$$
\dot{\mathbf x}(t)
=
\begin{bmatrix}
\dot{\mathbf r}(t) \\
\dot{\mathbf v}(t)
\end{bmatrix}
=
\begin{bmatrix}
\mathbf v(t) \\
\mathbf a(t)
\end{bmatrix}
$$

Fuer die reine Zwei-Koerper-Bewegung im Sonnenpotential:

$$
\mathbf a_\odot(\mathbf r)
= -\mu_\odot \frac{\mathbf r}{\|\mathbf r\|^3}
$$

Mit aktivierten Stoerungen und Antriebsbeschleunigungen:

$$
\mathbf a(\mathbf r,t)
=
\mathbf a_\odot(\mathbf r)
+ \mathbf a_{\mathrm{pert}}(\mathbf r,t)
+ \mathbf a_{\mathrm{sail}}(\mathbf r,t)
+ \mathbf a_{\mathrm{prop}}(\mathbf r,\mathbf v,t)
$$

Die Implementierung steht in `trajectory._acceleration()`. Die Integration
erfolgt in `trajectory._rk4()` mit klassischem Runge-Kutta vierter Ordnung fuer
$\dot{\mathbf x}=\mathbf f(t,\mathbf x)$:

$$
\begin{aligned}
\mathbf k_1 &= \mathbf f(t_n,\mathbf x_n),\\
\mathbf k_2 &= \mathbf f(t_n+\tfrac{\Delta t}{2},
                         \mathbf x_n+\tfrac{\Delta t}{2}\mathbf k_1),\\
\mathbf k_3 &= \mathbf f(t_n+\tfrac{\Delta t}{2},
                         \mathbf x_n+\tfrac{\Delta t}{2}\mathbf k_2),\\
\mathbf k_4 &= \mathbf f(t_n+\Delta t,
                         \mathbf x_n+\Delta t\,\mathbf k_3),\\
\mathbf x_{n+1}
&= \mathbf x_n
+ \frac{\Delta t}{6}
  (\mathbf k_1+2\mathbf k_2+2\mathbf k_3+\mathbf k_4).
\end{aligned}
$$

Die Schrittweite wird ueber `trajectory._adaptive_step_seconds()` an den
Sonnenabstand angepasst. In Sonnennaehe werden deutlich kleinere Zeitschritte
verwendet als im aeusseren Sonnensystem.

Grenzwert- und Singularitaetsbetrachtung:

| Gleichung | Kritischer Grenzfall | Bedeutung | Behandlung im Modell |
| --- | --- | --- | --- |
| $\mathbf a_\odot=-\mu_\odot\mathbf r/\|\mathbf r\|^3$ | $\|\mathbf r\|\rightarrow0$ | Singularitaet im Zentrum des Sonnenpotentials | Physikalisch unzulaessiger Zustand; die Missionskonfiguration erzwingt ein Perihel ausserhalb der Sonne. |
| $\hat{\mathbf r}=\mathbf r/\|\mathbf r\|$ | $\|\mathbf r\|=0$ | Radialrichtung undefiniert | `_normalize()` verwendet eine Ersatzlaenge, die Simulation soll diesen Zustand aber durch Validierung vermeiden. |
| $\hat{\mathbf v}=\mathbf v/\|\mathbf v\|$ | $\|\mathbf v\|=0$ | Bewegungsrichtung undefiniert | Fuer Burns nur sinnvoll bei nicht verschwindender Geschwindigkeit; `_normalize()` verhindert Division durch null, ersetzt aber keine physikalische Freigabe. |
| RK4-Schritt | $\Delta t\le0$ oder zu grosses $\Delta t$ | Keine Vorwaertspropagation bzw. Integrationsfehler | Schrittweiten werden radiusabhaengig begrenzt; nahe der Sonne kleinere Schritte. |
| Stoerbeschleunigung | Abstand Sonde-Planet $\rightarrow0$ | Planetare Stoerterme wuerden singulaer | Innerhalb der planetaren SOI wird der heliocentrische Stoerterm uebersprungen und das lokale Patched-Conic-Modell verwendet. |

## Planetenpositionen

<img src="docs/assets/formulas/kepler-anomalies.svg" alt="Kepler anomaly and radius relations" width="720">

Backend und Frontend verwenden vereinfachte Kepler-Elemente
$(a,e,i,\Omega,\omega,M)$. Aus mittlerer Laenge $L$, Laenge des Perihels
$\varpi$ und Knotenlaenge $\Omega$ werden die benoetigten Winkel bestimmt:

$$ M = L-\varpi $$

$$ \omega = \varpi-\Omega $$

Die exzentrische Anomalie `E` wird mit Newton-Iteration aus Keplers Gleichung
berechnet:

$$ E - e\sin(E) = M $$

Der Zusammenhang zwischen exzentrischer Anomalie $E$ und wahrer Anomalie
$\nu$ folgt in der ueblichen Form:

$$ \tan\frac{\nu}{2} = \sqrt{\frac{1+e}{1-e}}\,\tan\frac{E}{2} $$

Der Bahnradius der Keplerellipse kann damit wahlweise ueber $E$ oder
$\nu$ angegeben werden:

$$ r = a(1-e\cos E) = \frac{a(1-e^2)}{1+e\cos\nu} $$

Die kartesische Position in der Bahnebene lautet:

$$
\mathbf r' =
\begin{bmatrix}
a(\cos E-e)\\
a\sqrt{1-e^2}\sin E\\
0
\end{bmatrix}
$$

Die Rotation in das ekliptikale Inertialsystem erfolgt ueber:

$$ \mathbf r = R_z(\Omega)\,R_x(i)\,R_z(\omega)\,\mathbf r' $$

Damit ist die im Code verwendete direkte $x',y'$-Berechnung die kartesische
Auswertung derselben Kepler-Geometrie.

Die zugehoerigen Implementierungen sind `trajectory._planet_position_at()` und
`web/src/orbitalMath.ts`.

Grenzwert- und Singularitaetsbetrachtung:

| Gleichung | Kritischer Grenzfall | Bedeutung | Behandlung im Modell |
| --- | --- | --- | --- |
| $E-e\sin E=M$ | $e\rightarrow1$ | Parabolischer Grenzfall; Newton-Iteration kann schlecht konditioniert werden | Die verwendeten Planetendaten liegen im elliptischen Bereich $0\le e<1$. |
| $\tan(\nu/2)=\sqrt{(1+e)/(1-e)}\tan(E/2)$ | $e\rightarrow1$ | Nenner $1-e\rightarrow0$; elliptische Formel geht in parabolische Grenzform ueber | Nur fuer elliptische Planetenbahnen dokumentiert; nicht fuer parabolische/hyperbolische Kometenbahnen verwenden. |
| $\tan(E/2)$ | $E\rightarrow\pi$ | Tangens divergiert; $\nu$ ist trotzdem geometrisch definiert | In der Implementierung wird die kartesische $x',y'$-Form aus $\sin E,\cos E$ genutzt und umgeht diesen Tangens-Pol. |
| $r=a(1-e\cos E)$ | $a\le0$ oder $e\ge1$ | Ellipsenradius nicht mehr im verwendeten Modell definiert | Planetendaten werden als elliptische J2000-Naeherung interpretiert. |
| $r=a(1-e^2)/(1+e\cos\nu)$ | $1+e\cos\nu=0$ | Pol der Kegelschnittgleichung; bei Ellipsen mit $e<1$ nicht erreichbar | Fuer die verwendeten Planetenellipsen bleibt der Nenner positiv. |
| Rotationsmatrix | Winkel beliebig, aber nicht normalisiert | Mathematisch gueltig, numerisch koennen grosse Winkel Genauigkeit kosten | Winkel werden aus J2000-Elementen und Zeitfortschritt berechnet; trigonometrische Funktionen normalisieren periodisch. |

## Solar-Oberth-Mission

<img src="docs/assets/formulas/solar-oberth.svg" alt="Sundiver transfer and Solar-Oberth formulas" width="760">

Die Standardmission startet an der Erde, erzeugt eine Sundiver-Transferellipse
und fuehrt am Perihel ein impulsives Solar-Oberth-Manoever aus.

Der gewaehlte Perihelabstand der Sundiver-Bahn ist:

$$
r_p = q\,\mathrm{AU}
$$

Mit Startabstand $r_0=\|\mathbf r_0\|$ ergibt sich die Halbachse der
Transferellipse:

$$
a_t = \frac{r_0+r_p}{2}
$$

Die Geschwindigkeit auf der Transferellipse folgt aus der Vis-Viva-Gleichung:

$$
v(r)
=
\sqrt{\mu_\odot
\left(
\frac{2}{r}
- \frac{1}{a_t}
\right)}
$$

Der Oberth-Burn wird entlang des aktuellen Geschwindigkeitsvektors addiert:

$$
\mathbf v^+
= \mathbf v^-
+ \Delta v_{\mathrm{Oberth}}\,
  \frac{\mathbf v^-}{\|\mathbf v^-\|}
$$

Die thermische Last am Perihel wird aus der invers-quadratischen
Sonnenstrahlung berechnet:

$$
S(r)
= S_0
  \left(\frac{1\,\mathrm{AU}}{r}\right)^2
$$

Beispiel: Bei `q = 0.05 AU` ergibt sich:

$$
S(0.05\,\mathrm{AU})
= \frac{1361}{0.05^2}
\approx 5.44\cdot10^5\ \mathrm{W\,m^{-2}}
$$

Die Hitzeschildgrenze wird mit `heatshieldLimitWm2` verglichen.

Grenzwert- und Singularitaetsbetrachtung:

| Gleichung | Kritischer Grenzfall | Bedeutung | Behandlung im Modell |
| --- | --- | --- | --- |
| $r_p=q\,\mathrm{AU}$ | $q\le R_\odot/\mathrm{AU}$ | Perihel liegt in oder auf der Sonnenoberflaeche | `validate_mission_config()` lehnt Perihel innerhalb der Sonne ab. |
| $a_t=(r_0+r_p)/2$ | $r_0+r_p\le0$ | Keine physikalische Ellipse | Durch positive Radien und Perihelvalidierung ausgeschlossen. |
| Vis-Viva $v=\sqrt{\mu_\odot(2/r-1/a_t)}$ | $r\rightarrow0$ oder negativer Radikand | Singularitaet bzw. keine reale elliptische Geschwindigkeit | Perihelvalidierung und Sundiver-Geometrie halten $r>R_\odot$; bei ungueltiger Energie waere die Wurzel nicht real. |
| Oberth-Burn $\mathbf v^+=\mathbf v^-+\Delta v\,\mathbf v^-/\|\mathbf v^-\|$ | $\|\mathbf v^-\|=0$ | Burn-Richtung undefiniert | In der Sundiver-Bahn tritt kein Ruhezustand auf; `_normalize()` schuetzt numerisch, ersetzt aber keine Missionsvalidierung. |
| Solarfluss $S=S_0(1\,\mathrm{AU}/r)^2$ | $r\rightarrow0$ | Strahlungsfluss divergiert | Perihel ausserhalb der Sonne; Hitzeschildgrenze erzeugt Warnung bei Ueberschreitung. |

## Impulsive Burns und Treibstoff

<img src="docs/assets/formulas/rocket-equation.svg" alt="Rocket equation and propellant mass relation" width="760">

Kick-Stufe und Solar-Oberth-Burn nutzen die Raketengrundgleichung:

$$
\Delta v
= I_{sp}g_0\ln\left(\frac{m_0}{m_f}\right)
$$

Daraus folgt fuer eine angeforderte Geschwindigkeitsaenderung:

$$
m_f
= m_0\exp\left(-\frac{\Delta v}{I_{sp}g_0}\right)
$$

$$
m_{\mathrm{prop}}
= m_0-m_f
= m_0\left[
1-\exp\left(-\frac{\Delta v}{I_{sp}g_0}\right)
\right]
$$

Falls nicht genug Treibstoff verfuegbar ist, wird nur das erreichbare
`Delta-v` geliefert. Die Logik liegt in `satellite.KickStage.burn()` und wird
ueber `satellite.perform_oberth_burn()` ausgefuehrt.

Grenzwert- und Singularitaetsbetrachtung:

| Gleichung | Kritischer Grenzfall | Bedeutung | Behandlung im Modell |
| --- | --- | --- | --- |
| $\Delta v=I_{sp}g_0\ln(m_0/m_f)$ | $I_{sp}\le0$ oder $g_0=0$ | Kein physikalisch definierter Raketenantrieb | `KickStage` validiert positive spezifische Impulse. |
| $\ln(m_0/m_f)$ | $m_f\le0$ oder $m_0\le0$ | Logarithmus undefiniert; negative/Nullmasse unphysikalisch | Missionsmassen muessen positiv sein; Treibstoffverbrauch wird auf vorhandene Masse begrenzt. |
| $m_f=m_0\exp[-\Delta v/(I_{sp}g_0)]$ | $\Delta v<0$ | Negative Burn-Anforderung waere ein Vorzeichen-/Modellfehler | Missionsvalidierung lehnt negatives Oberth-Delta-v ab. |
| $m_{\mathrm{prop}}=m_0-m_f$ | angeforderter Verbrauch groesser als Vorrat | Gewuenschtes Delta-v nicht erreichbar | Code begrenzt Verbrauch auf verfuegbaren Treibstoff und meldet nur erreichtes Delta-v. |

## Kontinuierliche Antriebe

<img src="docs/assets/formulas/continuous-propulsion.svg" alt="Continuous propulsion formulas" width="760">

Kontinuierliche Antriebsmodule liefern einen Schubvektor $\mathbf F$ und
daraus eine Beschleunigung:

$$
\mathbf a_{\mathrm{prop}}
= \frac{\mathbf F}{m}
= \frac{F}{m}\,\hat{\mathbf d}
$$

Die Richtung $\hat{\mathbf d}$ wird je nach Modul als prograd, retrograd,
radial nach aussen oder radial nach innen aus $\mathbf r$ und $\mathbf v$
gebildet.

Solar Sail:

$$
F_{\mathrm{SS}}
= p_0\,A\,C_R
  \left(\frac{1\,\mathrm{AU}}{r}\right)^2
$$

Im Code ist $p_0=9.08\cdot10^{-6}\,\mathrm{N\,m^{-2}}$; $A$ ist die
Segelflaeche und $C_R$ der Reflexionsfaktor.

Electric Sail:

$$
F_{\mathrm{ES}}
=
\left(\frac{N L}{2000}\right)
\left(\frac{U}{20\,\mathrm{kV}}\right)
\frac{\eta_{\mathrm{sw}}}{\max(r/\mathrm{AU},0.1)}
$$

Dabei bezeichnet $N$ die Tetheranzahl, $L$ die Tetherlaenge in Kilometern,
$U$ die Tetherspannung und $\eta_{\mathrm{sw}}$ den Solarwind-Faktor.

Elektrische Triebwerke verbrauchen Treibstoff ueber:

$$
\dot m
= \frac{F}{I_{sp}g_0}
$$

Die Implementierung steht in `propulsion.py`.

Grenzwert- und Singularitaetsbetrachtung:

| Gleichung | Kritischer Grenzfall | Bedeutung | Behandlung im Modell |
| --- | --- | --- | --- |
| $\mathbf a_{\mathrm{prop}}=\mathbf F/m$ | $m\rightarrow0$ | Beschleunigung divergiert | `_thrust_result()` verwendet eine minimale Ersatzmasse; Missionskonfiguration fordert positive Massen. |
| Richtung $\hat{\mathbf d}$ | $\|\mathbf r\|=0$ oder $\|\mathbf v\|=0$ | Radiale/prograde Richtung undefiniert | `_normalize()` verhindert numerische Division durch null; physikalisch muss die Mission solche Zustaende vermeiden. |
| Solar Sail $F_{\mathrm{SS}}\propto1/r^2$ | $r\rightarrow0$ | Schub und thermische Last divergieren | Im Code wird fuer den Nenner mindestens `0.01` AU verwendet; zusaetzlich thermische Warnung ueber `thermalLimitWm2`. |
| Electric Sail $F_{\mathrm{ES}}\propto1/\max(r/\mathrm{AU},0.1)$ | $r\rightarrow0$ | Modell waere nahe der Sonne unbeschraenkt | Der Nenner ist explizit auf `0.1` begrenzt; das ist eine Modellklammer, keine reale Nahsonnenphysik. |
| $\dot m=F/(I_{sp}g_0)$ | $I_{sp}\le0$ | Massenstrom undefiniert | Elektrische/thermische Module verwenden positive Standardwerte; ohne gueltigen `Isp` wird kein Treibstoffmodell angewendet. |

## Lambert-Transfer

<img src="docs/assets/formulas/lambert-universal-variable.svg" alt="Lambert universal variable equations" width="820">

Fuer Wegpunkt-Routen wird zwischen zwei Randpunkten eine
Lambert-Randwertaufgabe geloest:

$$
\mathbf r(t_1)=\mathbf r_1,
\qquad
\mathbf r(t_2)=\mathbf r_2,
\qquad
\Delta t=t_2-t_1
$$

Die Transfergeometrie verwendet:

$$
c
=
\frac{\mathbf r_1\cdot\mathbf r_2}
{\|\mathbf r_1\|\,\|\mathbf r_2\|}
$$

$$
A
=
\sigma
\sqrt{
\frac{\|\mathbf r_1\|\|\mathbf r_2\|(1+c)}
{1-c}
},
\qquad
\sigma\in\{+1,-1\}
$$

Die universelle Variable `z` wird mit Stumpff-Funktionen berechnet:

$$
C(z)
=
\begin{cases}
\dfrac{1-\cos\sqrt z}{z}, & z>0,\\[6pt]
\dfrac{\cosh\sqrt{-z}-1}{-z}, & z<0,\\[6pt]
\dfrac{1}{2}, & z=0
\end{cases}
$$

$$
S(z)
=
\begin{cases}
\dfrac{\sqrt z-\sin\sqrt z}{(\sqrt z)^3}, & z>0,\\[6pt]
\dfrac{\sinh\sqrt{-z}-\sqrt{-z}}{(\sqrt{-z})^3}, & z<0,\\[6pt]
\dfrac{1}{6}, & z=0
\end{cases}
$$

Mit

$$
y(z)
=
\|\mathbf r_1\|+\|\mathbf r_2\|
+ A\,\frac{zS(z)-1}{\sqrt{C(z)}}
$$

und der Zeitgleichung

$$
\sqrt{\mu_\odot}\Delta t
=
\left(\frac{y}{C}\right)^{3/2}S
+ A\sqrt{y}
$$

wird `z` numerisch bestimmt. Danach folgen die Lagrange-Koeffizienten:

$$
f
=
1-\frac{y}{\|\mathbf r_1\|}
$$

$$
g
=
A\sqrt{\frac{y}{\mu_\odot}}
$$

$$
\dot g
=
1-\frac{y}{\|\mathbf r_2\|}
$$

Abflug- und Ankunftsgeschwindigkeit:

$$
\mathbf v_1 = \frac{\mathbf r_2 - f\mathbf r_1}{g}
$$

$$
\mathbf v_2 = \frac{\dot g\mathbf r_2 - \mathbf r_1}{g}
$$

Der beste Kandidat minimiert den Vektorunterschied zur vorhandenen
Grenzgeschwindigkeit:

$$
\Delta v_{\mathrm{inj}}
=
\left\|
\mathbf v_1-\mathbf v_{\mathrm{ref}}
\right\|
$$

Code: `route_planner._lambert_candidates()`,
`route_planner._select_lambert()` und
`route_planner._propagate_lambert_segment()`.

Grenzwert- und Singularitaetsbetrachtung:

| Gleichung | Kritischer Grenzfall | Bedeutung | Behandlung im Modell |
| --- | --- | --- | --- |
| $c=(\mathbf r_1\cdot\mathbf r_2)/(\|\mathbf r_1\|\|\mathbf r_2\|)$ | $\|\mathbf r_1\|=0$ oder $\|\mathbf r_2\|=0$ | Winkel zwischen Randvektoren undefiniert | Randpunkte muessen reale heliozentrische Positionen sein; Sonnenzentrum ist kein gueltiger Wegpunkt. |
| $A=\sigma\sqrt{\|\mathbf r_1\|\|\mathbf r_2\|(1+c)/(1-c)}$ | $c\rightarrow1$ | Start- und Zielrichtung nahezu kollinear; Nenner $(1-c)$ verschwindet | `_lambert_candidates()` bricht bei nahezu kollinearer Lambert-Geometrie mit Fehler ab. |
| $C(z),S(z)$ | $z\rightarrow0$ | Standardform haette `0/0`; Grenzwerte sind endlich | Code setzt die analytischen Grenzwerte $C(0)=1/2$, $S(0)=1/6$. |
| $y(z)$ | $C(z)\le0$ oder $y\le0$ | Quadratwurzel bzw. Transfergeometrie ungueltig | Kandidat wird verworfen, bis ein gueltiges Intervall gefunden wird. |
| Zeitgleichung | Keine Nullstelle in Suchintervall | Fuer Datum/Flugzeit existiert kein akzeptierter Transferzweig | Code sucht Brackets numerisch; ohne Bracket wird keine Lambert-Loesung gemeldet. |
| $g=A\sqrt{y/\mu_\odot}$ | $g\rightarrow0$ | Geschwindigkeit aus Lagrange-Koeffizienten divergiert | Kandidat wird verworfen, wenn `g` numerisch zu klein ist. |
| $\Delta v_{\mathrm{inj}}=\|\mathbf v_1-\mathbf v_{\mathrm{ref}}\|$ | keine Singularitaet, aber sehr gross moeglich | Energetisch unplausibler oder nicht realisierbarer Transfer | Optimierung waehlt kleinsten Kandidaten; Budgetpruefung erfolgt in Audit/Validierung. |

## Patched Conics und Swing-by

<img src="docs/assets/formulas/patched-conics-swingby.svg" alt="Patched-conic swing-by equations" width="800">

Die planetare Einflusssphaere wird mit der Laplace-Approximation berechnet:

$$
r_{\mathrm{SOI}}
=
a_p
\left(
\frac{m_p}{M_\odot}
\right)^{2/5}
$$

Die planetenzentrierte Ueberschussgeschwindigkeit:

$$
\mathbf v_{\infty}^{-}
=
\mathbf v_{\mathrm{arr}}
- \mathbf v_p
$$

$$
v_\infty
=
\left\|
\mathbf v_{\infty}^{-}
\right\|
$$

Der sichere Perizentrumsabstand wird aus Planetenradius und Mindesthoehe
gebildet:

$$
r_{p,\min}
= R_p+h_{\min}
$$

Maximaler sicherer Ablenkwinkel:

$$
\delta_{\max}
= 2\arcsin
\left(
\frac{1}
{1+r_{p,\min}v_\infty^2/\mu_p}
\right)
$$

Tatsaechliches Perizentrum aus gewaehltem Ablenkwinkel:

$$
r_p
=
\frac{\mu_p}{v_\infty^2}
\left[
\frac{1}{\sin(\delta/2)}
-1
\right]
$$

Ein unpowered Swing-by erhaelt den Betrag der
Ueberschussgeschwindigkeit:

$$
\left\|\mathbf v_{\infty}^{+}\right\|
=
\left\|\mathbf v_{\infty}^{-}\right\|
=v_\infty
$$

Der heliozentrische Ausgangszustand ist:

$$
\mathbf v_{\mathrm{out}}
=
\mathbf v_p+\mathbf v_{\infty}^{+}
$$

Die Hyperbel wird ueber die hyperbolische Anomalie `H` parametrisiert:

$$
x(H)
=
a_h(e_h-\cosh H)
$$

$$
y(H)
=
a_h\sqrt{e_h^2-1}\sinh H
$$

$$
t(H)
=
\sqrt{\frac{a_h^3}{\mu_p}}
\left(e_h\sinh H-H\right)
$$

Die Routinen liegen in `route_planner.py`; Details und Audit-Regeln stehen in
`CALCULATION_METHODS.md`.

Grenzwert- und Singularitaetsbetrachtung:

| Gleichung | Kritischer Grenzfall | Bedeutung | Behandlung im Modell |
| --- | --- | --- | --- |
| $r_{\mathrm{SOI}}=a_p(m_p/M_\odot)^{2/5}$ | $a_p\le0$, $m_p\le0$ oder $M_\odot\le0$ | Einflusssphaere nicht physikalisch definiert | Planetendaten enthalten positive Massen und Halbachsen; keine freie Nutzereingabe fuer diese Werte. |
| $\mathbf v_\infty^-=\mathbf v_{\mathrm{arr}}-\mathbf v_p$ | $v_\infty\rightarrow0$ | Kein hyperbolischer Vorbeiflug; Grenzfall zum Einfang oder koorbitalen Flug | Swing-by-Formeln mit $1/v_\infty^2$ sind dann ungueltig; solche Kandidaten muessen verworfen oder separat behandelt werden. |
| $\delta_{\max}=2\arcsin(1/(1+r_{p,\min}v_\infty^2/\mu_p))$ | $\mu_p\le0$ oder $v_\infty\rightarrow0$ | Argument geht gegen 1; Ablenkung gegen $\pi$, Hyperbelmodell degeneriert | Planeten-$\mu_p$ ist positiv; sehr kleine $v_\infty$ sind numerisch kritisch. |
| $r_p=\mu_p/v_\infty^2(1/\sin(\delta/2)-1)$ | $v_\infty=0$ | Division durch null | Nur fuer hyperbolische Ueberschussgeschwindigkeiten gueltig. |
| $1/\sin(\delta/2)$ | $\delta\rightarrow0$ | Perizentrum geht gegen unendlich; kein wirksamer Fly-by | Kleine Ablenkungen sind mathematisch gueltig, aber praktisch wirkungsarm; der Turn-Winkel wird im Audit sichtbar. |
| $\delta\rightarrow\delta_{\max}$ | Perizentrum erreicht Mindesthoehe | Kollisions-/Atmosphaerenrand | Code prueft Planetenradius, Mindesthoehe und Kollisionsreserve. |
| $y(H)=a_h\sqrt{e_h^2-1}\sinh H$ | $e_h\le1$ | Keine Hyperbel; elliptischer oder parabolischer Grenzfall | Hyperbelabschnitt ist nur fuer $e_h>1$ gueltig. |
| $t(H)=\sqrt{a_h^3/\mu_p}(e_h\sinh H-H)$ | $\mu_p\le0$ oder nicht reeller Wurzelausdruck | Zeitparametrisierung ungueltig | Planetare $\mu_p$ ist positiv; $a_h$ wird als positiver Hyperbel-Skalenparameter dokumentiert. |

## Zielasymptote

<img src="docs/assets/formulas/solar-asymptote.svg" alt="Solar escape asymptote equations" width="780">

Fuer den interstellaren Zielkurs wird aus Energie, Drehimpuls und
Exzentrizitaetsvektor die solare Hyperbelasymptote berechnet.

Spezifische Bahnenergie:

$$
\epsilon
=
\frac{\|\mathbf v\|^2}{2}
-\frac{\mu_\odot}{\|\mathbf r\|}
$$

Drehimpuls:

$$
\mathbf h = \mathbf r \times \mathbf v
$$

Exzentrizitaetsvektor:

$$
\mathbf e
=
\frac{\mathbf v\times\mathbf h}{\mu_\odot}
-\frac{\mathbf r}{\|\mathbf r\|}
$$

Fuer $\|\mathbf e\|>1$ liegt eine solare Fluchthyperbel vor. Mit
Periapsisrichtung $\hat{\mathbf p}=\mathbf e/\|\mathbf e\|$,
Bahnnormale $\hat{\mathbf h}=\mathbf h/\|\mathbf h\|$ und
Transversalrichtung $\hat{\mathbf q}=\hat{\mathbf h}\times\hat{\mathbf p}$
ergibt sich die asymptotische wahre Anomalie:

$$
\nu_\infty
=
\arccos\left(-\frac{1}{\|\mathbf e\|}\right)
$$

Die ausgehende Asymptotenrichtung:

$$
\hat{\mathbf s}_\infty
=
\hat{\mathbf p}\cos\nu_\infty
+\hat{\mathbf q}\sin\nu_\infty
$$

Der Zielfehler zum normierten Zielvektor $\hat{\mathbf t}$ wird als
Winkelrest bewertet:

$$
\alpha
=
\arccos
\left(
\hat{\mathbf s}_\infty\cdot\hat{\mathbf t}
\right)
$$

Falls der rein gravitative Swing-by nicht reicht, weist der Code ein separates
Zielinjektions-Delta-v aus:

$$
\Delta v_{\mathrm{target}}
=
\left\|
\mathbf v_{\mathrm{target}}
-\mathbf v_{\mathrm{gravity}}
\right\|
$$

Grenzwert- und Singularitaetsbetrachtung:

| Gleichung | Kritischer Grenzfall | Bedeutung | Behandlung im Modell |
| --- | --- | --- | --- |
| $\epsilon=\|\mathbf v\|^2/2-\mu_\odot/\|\mathbf r\|$ | $\|\mathbf r\|\rightarrow0$ | Energie divergiert im Sonnenzentrum | Durch Perihelvalidierung ausgeschlossen; keine Zielasymptote im Sonnenzentrum. |
| $\mathbf h=\mathbf r\times\mathbf v$ | $\|\mathbf h\|\rightarrow0$ | Rein radialer Flug; Bahnebene und Transversalrichtung undefiniert | `_solar_asymptote_direction()` gibt keine Asymptote zurueck, wenn der Drehimpuls zu klein ist. |
| $\mathbf e=(\mathbf v\times\mathbf h)/\mu_\odot-\mathbf r/\|\mathbf r\|$ | $\mu_\odot=0$ oder $\|\mathbf r\|=0$ | Exzentrizitaetsvektor undefiniert | Sonnen-$\mu_\odot$ ist konstant positiv; $r=0$ wird durch Missionsgrenzen vermieden. |
| $\hat{\mathbf p}=\mathbf e/\|\mathbf e\|$ | $\|\mathbf e\|=0$ | Periapsisrichtung undefiniert | Bei kreisfoermigen oder degenerierten Bahnen keine Zielasymptote. |
| $\nu_\infty=\arccos(-1/\|\mathbf e\|)$ | $\|\mathbf e\|\le1$ | Keine hyperbolische Fluchtasymptote | Code gibt nur fuer $\|\mathbf e\|>1$ eine Asymptote zurueck. |
| $\hat{\mathbf s}_\infty=\hat{\mathbf p}\cos\nu_\infty+\hat{\mathbf q}\sin\nu_\infty$ | $\|\mathbf h\|=0$ oder $\|\mathbf e\|=0$ | Basisvektoren $\hat{\mathbf p},\hat{\mathbf q}$ undefiniert | Asymptote wird nur berechnet, wenn Drehimpuls und Exzentrizitaet gueltig sind. |
| $\alpha=\arccos(\hat{\mathbf s}_\infty\cdot\hat{\mathbf t})$ | Skalarprodukt numerisch ausserhalb `[-1,1]` | Rundungsfehler macht `arccos` undefiniert | Code clamp't Winkelargumente auf `[-1,1]`. |
| $\Delta v_{\mathrm{target}}=\|\mathbf v_{\mathrm{target}}-\mathbf v_{\mathrm{gravity}}\|$ | keine mathematische Singularitaet | Kann beliebig gross werden, wenn Zielbedingung energetisch nicht passt | Wird als Sollanforderung ausgewiesen und gegen das konfigurierte Antriebsbudget geprueft. |

## Architektur

```text
.
├── main.py                # Flask-Web-Server, Routen und Startlogik
├── universe.py            # Simulationslogik der Himmelskoerper
├── satellite.py           # Satelliten-Klassen
├── trajectory.py          # Trajektorien- und Bahnberechnungen
├── route_planner.py       # Missions-Routenplanung
├── mission_optimizer.py   # Optimierung von Missionsparametern
├── calculation_audit.py   # Audit-Logging fuer Berechnungen
├── propulsion.py          # Antriebsmodelle
├── view_2d_celestials.py  # 2D-Visualisierung
├── view_3d_celestials.py  # 3D-Visualisierung
├── web/                   # Frontend-Dateien
├── scripts/               # Hilfsskripte
├── requirements.txt       # Python-Abhaengigkeiten
└── README.md              # Projektdokumentation
```

| Datei | Aufgabe |
| --- | --- |
| `main.py` | Flask-Routen, API-Endpunkte, Serverstart |
| `trajectory.py` | Solar-Oberth-Mission, RK4, N-Body-Stoerungen, Kalman-Navigation |
| `route_planner.py` | Lambert-Transfer, Swing-by, Zielasymptote, Audit |
| `propulsion.py` | Modulare Antriebsmodelle und kontinuierliche Beschleunigungen |
| `satellite.py` | Raumfahrzeugstruktur, Massen, Stufen, Tsiolkovsky-Burns |
| `mission_optimizer.py` | Suche und Bewertung von Missionsfenstern |
| `calculation_audit.py` | JSONL-Nachweis der berechneten Routen |
| `web/src/orbitalMath.ts` | Planetendarstellung aus Kepler-Elementen |
| `web/src/missionSimulation.ts` | Frontend-Konfiguration und API-Aufruf |
| `web/src/propulsionModels.ts` | Frontend-Parameter der Antriebsmodule |

## Voraussetzungen

- Python 3.8+
- `pip`
- Virtuelle Umgebung empfohlen

## Installation

Linux/macOS:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Start

```bash
python main.py
```

Danach im Browser oeffnen:

```text
http://localhost:30000
```

## Features

- Simulation von Missionen in 2D/3D.
- Routenplanung und Missionsfenster-Optimierung.
- Bahn- und Trajektorienberechnung.
- Interaktive Flask-Web-UI.
- Berechnungsaudit fuer Nachvollziehbarkeit.

## Screenshots / Visuals

Lege bei Bedarf Bilder in `screenshots/` ab und binde sie mit Markdown ein:

```md
![Alt-Text](screenshots/datei.png)
```

Die technisch gesetzten Formeln der README liegen als SVG in
`docs/assets/formulas/`. Die Solar-Oberth-Beispielgrafik liegt in
`docs/assets/solar-oberth-model.png`.

## Projekt-Roadmap

- [ ] Stabilere Berechnungen bei Randfaellen in der Missionssimulation.
- [ ] Einheitliche Eingabevalidierung fuer Missions- und Simulationsdaten.
- [ ] Bessere, konsistente Fehleranzeigen in der Web-Oberflaeche.
- [ ] Unit-Tests fuer `trajectory`, `route_planner`, `mission_optimizer`.
- [ ] Theme-Umschaltung und bessere Navigationsstruktur.
- [ ] Exportfunktionen fuer Missionsberichte als CSV/JSON.

## API und Audit

Die Simulationen werden ueber Flask-Endpunkte aufgerufen. Erfolgreiche
Routenberechnungen koennen in JSONL-Auditdateien protokolliert werden:

```text
logs/route_calculations.jsonl
logs/mission_optimizer.jsonl
```

Diese Dateien enthalten Grenzpunktfehler, Delta-v-Anforderungen,
Kollisionsreserven, Zielwinkel und Plausibilitaetsinformationen.

## Konfiguration

- Standard-Port: `30000`.
- Zentrale Parameter liegen im jeweiligen Modul, insbesondere in `main.py`,
  `trajectory.py`, `propulsion.py` und `web/src/missionSimulation.ts`.
- Unterstuetzte Kernabhaengigkeiten: `Flask`, `SciPy`, `Matplotlib`.

## Troubleshooting

| Problem | Loesung |
| --- | --- |
| Port bereits belegt | Alten Prozess stoppen oder Port in `main.py` wechseln. |
| `ModuleNotFoundError` | Virtuelle Umgebung pruefen und `pip install -r requirements.txt` erneut ausfuehren. |
| Unerwartete Simulationswerte | Eingaben auf Sinnwerte pruefen und mit kleineren Testfaellen starten. |

## Mitwirken

Kurze, klare Aenderungen sind willkommen. Funktionsaenderungen sollten mit
kurzer Testanweisung dokumentiert werden.

## MIT-Style Nutzungshinweis

Die Nutzung ist frei moeglich; bei Weitergabe bitte auf das Projekt als Ursprung
verweisen.

## Modellgrenzen

- Die Planetendaten sind vereinfachte J2000-Elemente und ersetzen keine
  SPICE-Ephemeriden.
- Patched Conics koppelt Sonnen- und Planetendynamik abschnittsweise; fuer eine
  missionskritische Auslegung waere eine hochgenaue simultane N-Koerper-
  Propagation erforderlich.
- Einige Antriebe sind bewusst als `conceptual`, `speculative` oder `fictional`
  markiert. `warp` veraendert die Newtonsche Flugbahn nicht und dient nur der
  Visualisierung.
- Die Three.js-Szene skaliert Entfernungen fuer Lesbarkeit; die physikalischen
  Berechnungen bleiben in Kilometer, Sekunden und `km/s`.

## Weiterfuehrende Dokumentation

- `CALCULATION_METHODS.md` beschreibt die Nachweisfuehrung der
  Routenberechnung.
- `docs/assets/solar-oberth-model.png` zeigt das technische Beispielmodell fuer
  den Sundiver-/Solar-Oberth-Abschnitt.
