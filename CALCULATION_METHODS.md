# Nachweisführung der Planeten- und Missionsbahnberechnung

## 1. Zweck und Nachweisstrategie

Dieses Dokument beschreibt die Rechenkette der Wegpunktroute so, dass jeder
Lauf reproduziert und ein Fehler einer eindeutig benannten Modellgrenze
zugeordnet werden kann. Zu jedem erfolgreichen Lauf wird zusätzlich ein
Datensatz in `logs/route_calculations.jsonl` geschrieben.

Die Berechnung ist in vier physikalische Segmente getrennt:

1. Erde bis Solar-Oberth-Manöver,
2. heliozentrischer Lambert-Transfer bis zur Einflusssphäre des Wegpunktes,
3. planetenzentrierte hyperbolische Swing-by-Bahn,
4. heliozentrischer Ausflug und asymptotischer Zielkurs.

Benachbarte Segmente müssen denselben kartesischen Grenzpunkt besitzen. Eine
gewollte Geschwindigkeitsänderung wird als Manöver protokolliert und darf nicht
als numerischer Restfehler verborgen werden.

### Manueller Routenentwurf

Der 3D-Routenentwurf kann zusätzliche Stützpunkte, Hilfslinien und
Radiuskreise enthalten. Erde, Sonne, der Wegpunkt am berechneten
Begegnungstag und das interstellare Ziel bleiben gesperrte Anker. Der Entwurf
wird im JSONL-Audit als `manualVisualRouteSketch` gespeichert, beeinflusst
aber nicht heimlich die Dynamik (`manualSketchAffectsDynamics: false`). Die
Nominalbahn wird anschließend weiterhin mit Lambert-Lösung,
Vorwärts-/Rückwärts-Kopplung und dem vollständigen Bahnmodell neu berechnet.

## 2. Koordinaten, Zeiten und Einheiten

- Internes Inertialsystem: heliozentrisch, ekliptikal, kartesisch.
- Positionen: Kilometer (`km`).
- Geschwindigkeiten: Kilometer pro Sekunde (`km/s`).
- Zeiten: Tage seit Missionsbeginn; Dynamikschritte in Sekunden.
- Gravitationsparameter: `km³/s²`.
- Zielkoordinaten: Rektaszension/Deklination; Umrechnung in die Ekliptik mit
  der mittleren Schiefe von `23,43928°`.

Jeder Audit-Datensatz enthält die Einheiten explizit. Komponenten dürfen nicht
zwischen der physikalischen Berechnung und der Three.js-Darstellung vertauscht
werden. Die Darstellung führt lediglich die Abbildung `(x,y,z) -> (x,z,y)` und
die konfigurierten visuellen Skalierungen aus.

## 3. Lambert-Abschnitt

Für Startposition `r₁`, SOI-Eintrittsposition `r₂` und Flugzeit `Δt` löst die
universelle Lambert-Gleichung die Randwertaufgabe

`r(t₁)=r₁`, `r(t₂)=r₂`.

Es werden positive/negative Transferseite, prograde/retrograde Richtung und
zulässige Mehrfachumlauf-Familien erzeugt. Gewählt wird der Kandidat mit dem
kleinsten vollständigen Vektorunterschied zur bereits vorhandenen
Oberth-Geschwindigkeit. Das Ergebnis sind Abflug- und
Ankunftsgeschwindigkeit `v₁` und `v₂`. Der
benötigte Einspritzimpuls lautet

`Δv_injection = ||v₁ - v_burn||`.

Die Lambert-Bahn wird anschließend mit der adaptiven DOP853-Integration und
engen Positions-/Geschwindigkeitstoleranzen erneut propagiert. Ihr letzter
Punkt wird exakt auf den ersten Punkt der SOI-Hyperbel gesetzt. Positions- und
Geschwindigkeitsabweichung vor dieser Kopplung bleiben als Diagnosewerte
erhalten. Damit kann eine fehlerhafte Darstellungsabtastung nicht mehr durch
das nachträgliche Verbinden der Segmente verborgen werden.

## 4. Einflusssphäre und planetarer Relativzustand

Die Laplace-Einflusssphäre wird angenähert durch

`r_SOI = a_p (m_p / M_sun)^(2/5)`.

Die planetenzentrische Überschussgeschwindigkeit ist

`v_inf,in = v_arrival - v_planet`.

Am endlichen SOI-Rand wird die asymptotische Geschwindigkeit aus der
Energiegleichung bestimmt:

`v_inf² = v_entry² - 2 μ_p / r_SOI`.

## 5. B-Plane, Kollisionsschutz und Zielbedingung

Die Benutzereingabe zur Vorbeiflughöhe ist eine harte Mindesthöhe. Damit gilt

`r_p,min = R_p + h_min`.

Der maximal sichere Ablenkwinkel ist

`δ_max = 2 asin(1 / (1 + r_p,min v_inf² / μ_p))`.

Für einen Ziel-Einheitsvektor `t` wird zuerst geprüft, ob die
heliozentrische Zielgerade die Kugel der erreichbaren planetenzentrischen
Ausflugsgeschwindigkeiten schneidet:

`||s t - v_planet|| = v_inf`.

Nach Quadrieren entsteht

`s² - 2 s (t·v_planet) + ||v_planet||² - v_inf² = 0`.

Ein positiver Lösungswert `s` ist erreichbar, wenn der Winkel zwischen
`v_inf,in` und `s t - v_planet` nicht größer als `δ_max` ist. Aus dem gewählten
Ablenkwinkel folgt der tatsächlich benötigte Perizentrumsradius

`r_p = μ_p/v_inf² (1/sin(δ/2) - 1)`.

Als harte Invariante muss `r_p > R_p` gelten. Im Audit werden Planetenradius,
Mindesthöhe, gewählte Höhe und Kollisionsreserve getrennt gespeichert.

## 6. Hyperbel innerhalb der Einflusssphäre

Mit `a = μ_p/v_inf²` und `e = 1 + r_p/a` wird die Hyperbel über die
hyperbolische Anomalie `H` parametrisiert:

`x = a(e-cosh H)`

`y = a sqrt(e²-1) sinh H`

`t(H) = sqrt(a³/μ_p) (e sinh H-H)`.

Die B-Plane-Basis wird aus ein- und ausgehendem `v_inf` gebildet. Der Punkt bei
`H=0` ist das Perizentrum und besitzt per Konstruktion den Abstand `r_p` vom
Planetenzentrum.

## 7. Zielinjektion und solares 3D-Shooting

Ein reiner Swing-by kann Zielrichtung und solare Fluchtenergie nicht in jeder
Konstellation gleichzeitig erfüllen. Der gravitative Ausflug wird deshalb
zuerst unverändert protokolliert. Falls nötig, wird am SOI-Austritt ein
separater Zielinjektionsvektor ausgewiesen:

`Δv_target = ||v_target-injection - v_gravity-exit||`.

Die Mindestgeschwindigkeit beträgt 105 % der lokalen solaren
Fluchtgeschwindigkeit

`v_escape = sqrt(2 μ_sun / r_exit)`.

Die Richtung der Zielinjektion wird nicht direkt gleich dem Sternvektor
gesetzt. Aus Energie-, Drehimpuls- und Exzentrizitätsvektor wird die ausgehende
solare Hyperbelasymptote analytisch bestimmt. Ein Nelder-Mead-Shooting variiert
Länge und Breite des Anfangsvektors für mehrere Fluchtgeschwindigkeiten. Unter
allen auf das Ziel konvergierten Lösungen wird das kleinste Korrektur-Δv
gewählt.

Übersteigt dieses Manöver das konfigurierte Antriebsbudget, bleibt es eine
Sollanforderung und wird **nicht** in die tatsächliche Trajektorie eingesetzt.
Die propagierte Bahn folgt dann kontinuierlich dem rein gravitativen
Austrittszustand; Soll-Zielrichtung, fehlendes Δv und Richtungsänderung werden
separat ausgewiesen.

## 8. Kontinuitäts- und Plausibilitätsprüfungen

Jeder Lauf protokolliert mindestens:

- Positionslücken an allen Segmentgrenzen,
- Geschwindigkeitsrest am Lambert/SOI-Modellwechsel,
- beabsichtigtes Zielinjektions-Δv,
- Kollisionsreserve über der Planetenoberfläche,
- solare Fluchtgeschwindigkeit und gewählte Abfluggeschwindigkeit,
- Winkelrest zum Ziel nach dem Shooting,
- Zahl der Shooting-Iterationen,
- Erfüllung des konfigurierten Δv-Limits.

Eine Route darf nur dann als vollständig flugfähig gelten, wenn alle harten
Invarianten erfüllt sind und sämtliche beabsichtigten Manöver innerhalb eines
expliziten Antriebsbudgets liegen. Eine grüne Linie kennzeichnet den gewählten
Zielpfad, ersetzt aber nicht diese numerische Freigabe.

## 9. Bekannte Modellgrenzen

- Patched Conics schaltet zwischen Sonnen- und Planetengravitation um; eine
  hochgenaue Missionsauslegung benötigt simultane N-Körper-Integration.
- Planetendaten und Ephemeriden sind für Visualisierung und Vorentwurf
  vereinfacht und ersetzen keine SPICE-Kernel.
- Die globale Ansicht bleibt vollständig heliocentrisch und unvergrößert. Der
  separate Flyby-Fokus ist planetenzentriert und linear skaliert. Die Modi
  „SOI gesamt“ und „Perizentrum“ verwenden unterschiedliche, jeweils intern
  konstante Maßstäbe, weil Planet und SOI nicht gleichzeitig sichtbar wären.
- Kalman-Resultate beschreiben Navigationsunsicherheit, nicht die Unsicherheit
  des physikalischen Modells oder der Ephemeriden.

## 10. Auswertung des JSONL-Protokolls

Jede Zeile ist ein vollständiges JSON-Objekt und kann unabhängig gelesen
werden. `runId` und UTC-Zeit identifizieren den Lauf. Für die Fehlersuche sollte
in dieser Reihenfolge geprüft werden:

1. `validation.collisionFree`,
2. `continuity.positionGapsKm`,
3. `lambert.entryVelocityResidualKmS`,
4. `flyby.selectedTurnDeg` und `flyby.actualAltitudeKm`,
5. `targeting.asymptoteErrorDeg`,
6. `targeting.correctionDeltaVKmS`,
7. `validation.routeFeasibleWithConfiguredPropulsion`.

## 11. Frühe iterative Missionsnavigation

Der KI-Missionsnavigator ist kein nachträglicher Schönheitsfilter. Er arbeitet
vor der endgültigen Bahndarstellung in zwei Ebenen:

1. Eine breite Suche bewertet Startdatum, Begegnungstag und den symmetrischen
   Suchhorizont mit dem schnellen Zwei-Körper-/Lambert-/Asymptotenmodell.
2. Mehrere räumlich und zeitlich unterschiedliche Spitzenkandidaten werden mit
   dem vollständigen Segmentmodell validiert. Dabei werden Lambert-Zweig,
   adaptive Propagation, SOI-Hyperbel, Kollisionsfreiheit, Zielasymptote,
   Kalman-Streuung und beide Δv-Anforderungen erneut berechnet.

Ein Kandidat wird mit konkreten Gründen abgelehnt, beispielsweise
`Lambert-Einspritz-Δv über Budget`, `Zielinjektions-Δv über Budget`,
`Zielwinkel über Toleranz`, `Randpunktfehler` oder `Körperkollision`. Die Suche
meldet nur dann Konvergenz, wenn mindestens ein voll validierter Kandidat alle
Plausibilitätsbedingungen erfüllt. Andernfalls endet sie explizit mit
`search-bounds-exhausted-without-plausible-route`. Ist dagegen die gesamte
Geometrie erfüllt, aber die gewünschte 1-AE-Geschwindigkeit mit dem
konfigurierten Oberth-Impuls energetisch unmöglich, lautet der Abbruchgrund
`solar-energy-boundary-unreachable-with-configured-burn`.

Jede Navigatorsuche wird einschließlich Iterationshistorie, der besten
Schnellmodell-Kandidaten, sämtlicher Vollvalidierungen, Ablehnungsgründe und
Verweisen auf die einzelnen Routen-Audits in
`logs/mission_optimizer.jsonl` gespeichert.

## 12. Ausgangsschätzung und berechnetes Begegnungsereignis

Der eingegebene Suchbeginn, Begegnungstag und Suchhorizont werden im Ergebnis
und Audit unverändert als Ausgangsschätzung festgehalten. Sie sind keine
Randbedingung und werden nicht als eigener Vollmodell-Kandidat geprüft. Der
eingegebene Begegnungstag ist damit kein Solltermin, sondern ausschließlich ein
Startwert für die Suche. Das Suchergebnis
liefert das tatsächlich berechnete Kalenderereignis `optimizedEncounterDate`
und den zugehörigen Missionstag. Nach dem Lauf führt die Bedienoberfläche
Startdatum, Missionstag und Horizont auf dieses Ergebnis nach, sodass ein
Folgelauf dort iterativ weiterarbeitet.

In Auswertung und 3D-Ansicht werden deshalb beide Datensätze geführt:

- `requestedPlan` enthält aus Kompatibilitätsgründen die ursprüngliche
  Ausgangsschätzung und ihr Kalenderdatum; `isConstraint` ist `false`,
- `optimizedStartDate`, `optimizedEncounterDay` und
  `optimizedEncounterDate` sowie `optimizedSearchWindowDays` enthalten das
  berechnete Ereignis,
- `planComparison` dokumentiert Änderungen und Differenzen,
- die berechnete Route steuert die tatsächlich dargestellte Bahn und
  Planetenkonstellation.

Wenn kein Kandidat alle harten Kriterien erfüllt, ist das ausgegebene
„Optimum“ ausdrücklich nur das beste Suchminimum und keine Flugfreigabe.

## 13. Räumliche B-Plane und vollständiger Vorbeiflug

Der planetenzentrierte Vorbeiflug wird nicht in die Ekliptik gezwungen. Aus
ankommendem Hyperbelüberschussvektor, Planetenbewegung und räumlicher
Zielrichtung wird die erreichbare Austrittsrichtung gewählt. Die Ebene der
Hyperbel folgt daraus eindeutig. Bei einer Umlenkung zu einem Ziel unterhalb
der Ekliptik liegt das Perizentrum typischerweise oberhalb des Planeten, damit
dessen Gravitation den Geschwindigkeitsvektor nach unten dreht.

Die API übergibt alle 301 planetenzentrierten Zustände vom SOI-Eintritt über
das Perizentrum bis zum SOI-Austritt und zusätzlich für jeden globalen Punkt
den zeitgleichen Planeten- und Relativzustand. In der Hauptansicht wird jeder
Punkt genau einmal im heliocentrischen System dargestellt. Es gibt dort keine
ersetzte Hyperbel, logarithmische Lupe oder grafische Verbindungskurve.

Der separate Flyby-Fokus verwendet `r_sonde(t) - r_planet(t)` und einen
konstanten linearen Maßstab. „SOI gesamt“ erhält Ein-/Austrittsrichtung und
zeigt den Planeten maßstäblich sehr klein; „Perizentrum“ zeigt Kollisionsreserve
und Nahpassage. Dadurch bleiben Winkel und Tangenten in beiden Fokusmodi
unverfälscht. Eintritts-, Perizentrums- und Austrittsbreite, B-Plane-Normale,
Soll-Mindesthöhe und tatsächlich gewählte Höhe bleiben im Routenergebnis und
im Audit erhalten.

Zur visuellen Prüfung startet der Flyby-Fokus im Perizentrumsmaßstab. Die
analytische Hyperbel enthält 301 Zustände; Eintritts-, Perizentrums- und
Austrittstangente werden farbig dargestellt. Beschriftungen der global kaum
auflösbaren SOI-Punkte liegen nicht mehr über der Hauptkurve. Ein gegebenenfalls
anschließender Zielimpuls am SOI-Austritt wird ausdrücklich getrennt von der
gravitativ stetigen Hyperbel ausgewiesen.

## 14. Bidirektionale Randwertsuche

Die Missionsnavigation rechnet jeden Schnellmodell-Kandidaten in beiden
Richtungen:

1. Vorwärts: Sonnenanflug, Oberth-Randzustand und Lambert-Lösung ergeben den
   Jupiter-Anflug sowie `v_inf,in`.
2. Rückwärts: Aus der interstellaren Zielrichtung wird die erforderliche
   ausgehende solare Hyperbelasymptote bestimmt. Bei festem Betrag von
   `v_inf` wird daraus der geforderte Jupiter-Austrittsvektor berechnet.
3. Kopplung: Geforderter und durch die B-Plane erreichbarer Austritt werden
   über Ablenkwinkelrest und äquivalenten Geschwindigkeitsrest verglichen.

Der Swing-by darf den Betrag von `v_inf` nicht ändern. Reicht der bei der
eingegebenen Mindesthöhe verfügbare Ablenkwinkel aus, wird die Rückwärtslösung
rein gravitativ verwendet. Andernfalls wird der noch fehlende Zielimpuls
separat ausgewiesen und nur innerhalb des konfigurierten Budgets angewendet.

„Sonnenaustrittsgeschwindigkeit“ ist eindeutig als Geschwindigkeit der
oszulierenden ausgehenden Sonnenbahn bei `1 AE` definiert. Sie wird aus der
spezifischen Bahnenergie des Lambert-Abflugzustands berechnet. Der Navigator
optimiert ihren Rest zur Zielgeschwindigkeit zusammen mit Startdatum,
Jupiter-Begegnungszeit, Oberth-Vektor, B-Plane-Rest und Zielwinkel.

Die Kalenderannäherung verwendet für Startdatum, Begegnungstag und den kleinsten
noch notwendigen Suchhorizont dieselbe feste Auflösung: zunächst 100 Tage,
dann 10 Tage im Bereich von ±50 Tagen, 5 Tage im Bereich von ±25 Tagen und
abschließend 1 Tag. Der Horizont wird symmetrisch um das Suchstartdatum ab
500 Tagen in beide Richtungen erweitert und ist bei 7.305 Tagen (20 Jahren)
begrenzt. Passende Spitzen aus früheren `mission_optimizer.jsonl`-Läufen werden
als empirische Startbecken wiederverwendet, ersetzen aber weder das Raster noch
die Vollvalidierung.

Jede der vier Rasterstufen besitzt mehrere räumlich verschiedene Suchdurchläufe
(standardmäßig 2 + 3 + 3 + 4 = 12). Die Anker werden zwischen den Durchläufen
auf mehrere lokale Minima verteilt. Anschließend gelangen standardmäßig acht
zeitlich unterschiedliche Kandidaten in das vollständige Bahnmodell. Die
Auswahl priorisiert strikt: vollständig flugfähig, danach vollständig grüne
Geometrie, danach erst das kleinste verbleibende Fehlermaß. Innerhalb der
grünen Geometrien werden ein kleiner tatsächlich angewendeter Zielimpuls und
eine kürzere Flugzeit höher bewertet als ein bloß kleiner passiver
B-Plane-Randrest.

Vor der Kalendersuche wird zusätzlich eine obere Antriebsenergiegrenze
berechnet. Aus
dem Vorbrandzustand am konfigurierten Perihel und dem verfügbaren Oberth-Δv
folgen die maximal mögliche Geschwindigkeit bei 1 AE sowie das minimale
Oberth-Δv für die Zielgeschwindigkeit. Da ein anderes Datum keine Bahnenergie
erzeugt, wird ein nachweislich unerreichbares Geschwindigkeitsziel nicht durch
Kalenderoptimierung grün markiert; die weiterhin veränderbare Jupiter- und
Zielgeometrie wird dennoch unabhängig optimiert und ausgewiesen.

Der ausgegebene Mangel `additionalDeltaVRequiredKmS` ist ausdrücklich ein
fehlender Geschwindigkeitsimpuls des Triebwerks und kein elektrischer
Leistungsbedarf in Watt. Energiequelle und Triebwerk werden getrennt betrachtet:
Eine Solar-, Radioisotop-, Spaltungs- oder Fusionsquelle kann ein Triebwerk
versorgen; ob das Manöver gelingt, bestimmen zusätzlich Schub, spezifischer
Impuls, Treibstoffmasse und verfügbare Burn-Dauer. Die Objektansicht führt diese
Kopplung bis zum konzeptionellen Fusionssystem auf, ohne hohe Reaktorleistung
automatisch als flugfähiges Oberth-Manöver zu werten.

Nach dem Jupiter-Austritt wird für jeden propagierten Punkt der Zielfortschritt

`q(t) = (r(t) - r_exit) · t_target`

geprüft. Eine freigegebene Route muss monoton zunehmendes `q(t)` besitzen;
damit enthält die angezeigte Anschlussbahn keinen Abschnitt mehr, der vom
Zielkorridor wegführt. Die globale Darstellung zeichnet alle vier physischen
Segmente als eine einzige, homogene Linie. Segmentgrenzen bleiben nur für
Timeline, Audit und Detailanalyse erhalten.
