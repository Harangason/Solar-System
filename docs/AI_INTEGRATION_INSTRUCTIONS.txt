# Anweisung: echte GenAI- und ML-Erweiterung fuer die Missionsplanung

## Ausgangslage

Die aktuelle Anwendung verwendet keine echte KI im Sinne von LLM, Deep Learning
oder trainiertem ML-Modell. Die als "KI" bezeichnete Funktion im UI ist derzeit
eine klassische numerische Such- und Optimierungslogik:

- Lambert-Randwertloeser
- Patched-Conic-/Swing-by-Modell
- RK4- und DOP853-Propagation
- N-Koerper-Validierung
- SciPy-Optimierung und Kandidatenbewertung
- Audit-Logs fuer Route, Optimierer und Playback

Das ist als physikalischer Solver wertvoll und soll erhalten bleiben. Die
geplante KI-Erweiterung darf den Solver nicht ersetzen, sondern soll ihn
gezielter steuern, erklaeren und kontrollieren.

## Groesse des Einbaus

Der Einbau ist mittelgross bis gross, weil drei unterschiedliche KI-Aufgaben
getrennt umgesetzt werden sollten. Eine einzelne zentrale KI waere zu
undurchsichtig und wuerde Sicherheits-, Qualitaets- und Debugging-Probleme
vergroessern.

Realistische Groessenordnung:

| Ausbaustufe | Umfang | Ergebnis |
| --- | --- | --- |
| Prototyp | 3-7 Tage | Textbasierte Missionsassistenz, Tool-Aufrufe, erste Plausibilitaetsberichte |
| Solide MVP-Version | 2-4 Wochen | Drei KI-Rollen, API-Endpunkte, UI-Integration, Audit, reproduzierbare Solver-Laeufe |
| Robuste Version | 1-3 Monate | ML-gestuetzte Kandidatenpriorisierung, Auswertung vieler Simulationslaeufe, Regressionstests, Sprachmodus, Qualitaetsmetriken |

Die groesste technische Arbeit liegt nicht im Aufruf eines LLMs, sondern in:

- sauberen Schnittstellen zwischen KI und Solver
- strukturierten Daten fuer Missionszustand, Route, Views und Audit
- Absicherung gegen falsche KI-Annahmen
- Wiederholbarkeit der Berechnungen
- Trainings- oder Bewertungsdaten fuer ML-Modelle

## Zielarchitektur

Es sollen mindestens drei getrennte KI-Instanzen eingefuehrt werden:

1. **Berechnungs-KI**
2. **Interaktions-KI**
3. **Plausibilitaets-KI**

Diese drei Rollen duerfen miteinander kommunizieren, aber sie muessen getrennte
Aufgaben, Prompts, Berechtigungen und Audit-Spuren haben.

Der physikalische Solver bleibt die Quelle der Wahrheit. Die KI darf Vorschlaege
machen, Parameterbereiche eingrenzen, Ergebnisse erklaeren und Warnungen
aussprechen. Sie darf keine berechneten Missionswerte erfinden.

## Rolle 1: Berechnungs-KI

### Aufgabe

Die Berechnungs-KI soll die numerische Suche zielfuehrender machen. Sie waehlt
nicht direkt die endgueltige Flugbahn, sondern erzeugt bessere Suchraeume,
Startwerte und Kandidaten fuer den bestehenden Solver.

### Darf

- Ziel, Wegpunkte, Antrieb, Delta-v-Budget und Missionsdauer analysieren
- Suchfenster, Startdaten und Encounter-Tage vorschlagen
- zwischen direkter Solar-Oberth-Route und Gravity-Assist-Route priorisieren
- Kandidaten fuer Lambert-, B-Plane- und Korridorparameter erzeugen
- aus frueheren `logs/mission_optimizer.jsonl` lernen
- unplausible Bereiche frueh verwerfen
- Solver-Laeufe ueber definierte Tool-/API-Aufrufe starten

### Darf nicht

- physikalische Endergebnisse frei formulieren
- Solver-Ausgaben ueberschreiben
- Validierungsfehler ignorieren
- eine Route als flugfaehig markieren, wenn der Solver oder die
  Plausibilitaets-KI widerspricht

### ML-Anteil

Sinnvoll ist ein hybrider Ansatz:

- LLM fuer Strategie, Parametervorschlaege und Erklaerung
- klassisches ML oder Bayesian Optimization fuer Kandidatenpriorisierung
- spaeter optional ein Surrogate Model, das teure Solver-Laeufe vorherschaetzt

Trainingsdaten koennen aus eigenen Simulationslaeufen entstehen:

- Eingabeparameter
- gewaehlte Startwerte
- Solver-Konvergenz
- Delta-v-Budget
- Zielabweichung
- Ablehnungsgruende
- Laufzeit
- Plausibilitaetsstatus

## Rolle 2: Interaktions-KI

### Aufgabe

Die Interaktions-KI reagiert auf User-Eingaben per Text und spaeter Sprache. Sie
uebersetzt Nutzerwuensche in strukturierte Missionsparameter und erklaert
Ergebnisse verstaendlich.

### Darf

- Fragen zum Missionsziel stellen
- natuerliche Sprache in Missionskonfiguration uebersetzen
- bestehende Solver-Ergebnisse zusammenfassen
- Unterschiede zwischen Kandidaten erklaeren
- UI-Aktionen vorschlagen oder ausloesen, wenn der Nutzer zustimmt
- Antwort als Text bereitstellen
- optional Text-to-Speech-Ausgabe erzeugen
- optional Speech-to-Text-Eingaben verarbeiten

### Darf nicht

- ohne Rueckfrage riskante Missionsparameter massiv veraendern
- technische Warnungen verstecken
- eine nicht validierte Route als sicher darstellen
- Plausibilitaetspruefungen umgehen

### UI-Integration

Die aktuelle UI-Beschriftung "KI" sollte erst dann verwendet werden, wenn diese
Rolle wirklich angebunden ist. Bis dahin sollte die bestehende Funktion neutral
als "Optimierer", "Randwertsuche" oder "Solver-Suche" bezeichnet werden.

Empfohlene UI-Elemente:

- Chat-/Assistenzpanel fuer Missionsplanung
- Mikrofon-Button fuer Spracheingabe
- Lautsprecher-Button fuer Sprachausgabe
- sichtbare Quellenangabe: "Antwort basiert auf Solver-Lauf X"
- Button "Vorschlag uebernehmen"
- Button "Nur erklaeren"
- Button "Erneut berechnen"

## Rolle 3: Plausibilitaets-KI

### Aufgabe

Die Plausibilitaets-KI prueft Ergebnisse, Visualisierung und UI-Zustand gegen
die berechneten Daten. Sie ist eine Kontrollinstanz, nicht der kreative
Navigator.

### Darf

- Solver-Ergebnis, Audit-Log und UI-State vergleichen
- pruefen, ob 2D- und 3D-View dieselbe Route darstellen
- Einheiten, Skalen und Zeitpunkte kontrollieren
- Delta-v, Flugtage, Encounter-Datum und Zielabweichung vergleichen
- Widersprueche zwischen Textanzeige und JSON-Ergebnis melden
- Warnungen fuer nicht flugfaehige oder nur "best-effort" Routen erzeugen
- Regressionen nach Codeaenderungen erkennen

### Darf nicht

- numerische Validierung durch freie LLM-Einschaetzung ersetzen
- eine harte Solver-Warnung abschwaechen
- UI-Anzeigen eigenmaechtig korrigieren, ohne den Fehler zu protokollieren

### Pruefpunkte

Mindestens diese Pruefungen sind erforderlich:

- Stimmen `optimizedStartDate`, `optimizedEncounterDate` und `encounterDay`
  zwischen API, UI und Audit ueberein?
- Wird eine nicht plausible Route als solche angezeigt?
- Sind 2D-Route, 3D-Route und JSON-Route dieselbe Kandidatenroute?
- Sind Einheiten korrekt: km, km/s, Tage, Grad, AE?
- Stimmen Delta-v-Budget und erforderliches Delta-v ueberein?
- Sind N-Koerper-Validierung und Solver-Status sichtbar?
- Wird bei fehlgeschlagener Validierung keine "flugfaehige Route" behauptet?

## Empfohlene technische Struktur

Neue Backend-Module:

```text
ai/
  __init__.py
  schemas.py
  tool_contracts.py
  calculation_agent.py
  interaction_agent.py
  plausibility_agent.py
  memory_store.py
  graph_store.py
  vector_store.py
  evaluation.py
```

Neue API-Endpunkte:

```text
POST /api/ai/mission-chat
POST /api/ai/calculation-suggest
POST /api/ai/plausibility-check
GET  /api/ai/audit/latest
GET  /api/ai/audit/log
```

Neue Logdateien:

```text
logs/ai_interaction.jsonl
logs/ai_calculation.jsonl
logs/ai_plausibility.jsonl
```

Die KI-Endpunkte sollen strukturierte JSON-Schemas verwenden. Freitext darf nur
fuer Erklaerungen genutzt werden, nicht fuer maschinenkritische Werte.

## KI-Gedaechtnis und Wissensspeicher

Die JSON-Schemas sind nicht das Wissen oder Gedaechtnis der KI. Sie sind der
Schnittstellenvertrag zwischen Anwendung, Solver und KI-Agenten. JSON legt fest,
welche Felder erlaubt sind, welche Datentypen gelten und welche Werte
maschinenkritisch verarbeitet werden duerfen.

Beispiel:

```json
{
  "targetId": "jupiter",
  "startDate": "2026-07-30",
  "maxDeltaVKmS": 12.5,
  "routeType": "gravity-assist"
}
```

Dieses JSON ist eine sichere Eingabe oder Ausgabe, aber kein semantisches
Langzeitgedaechtnis.

Fuer echtes KI-Gedaechtnis sollte ein hybrider Speicher verwendet werden:

| Speicher | Aufgabe |
| --- | --- |
| JSONL/SQLite | Reproduzierbare Solver-Laeufe, Audits, Inputs, Outputs und Fehler |
| Graphdatenbank | Beziehungen zwischen Missionen, Routen, Segmenten, Planeten, Constraints, Solver-Laeufen, View-Zustaenden und Plausibilitaetsfunden |
| Vektorindex | Semantische Suche ueber Dokumentation, alte Erklaerungen, Nutzerfragen und aehnliche Missionsfaelle |

Die Graphdatenbank ist besonders sinnvoll, weil die Missionsplanung stark aus
Beziehungen besteht:

```text
Mission -> Route -> Segment -> Body
Mission -> SolverRun -> Candidate -> RejectionReason
Route -> View2DState -> DisplayedSegment
Route -> View3DState -> DisplayedSegment
SolverRun -> AuditFinding -> Constraint
Body -> EphemerisSource -> Kernel
```

Damit kann die KI spaeter Fragen beantworten wie:

- Welche frueheren Jupiter-Swing-bys sind am Delta-v-Budget gescheitert?
- Welche Routen wurden in 2D anders dargestellt als im Audit berechnet?
- Welche Parameterkombinationen fuehrten oft zu nicht loesbaren Lambert-Zweigen?
- Welche Plausibilitaetswarnungen treten nach UI-Aenderungen wiederholt auf?

Empfohlene Aufteilung:

- **JSON-Schemas** fuer sichere API-Kommunikation
- **JSONL/SQLite** fuer unveraenderliche, reproduzierbare Laufprotokolle
- **Graphdatenbank** fuer Missionswissen und Beziehungen
- **Vektorindex** fuer semantische Suche und Erklaerkontext

Die Berechnungs-KI und Plausibilitaets-KI sollten bevorzugt die Graphdatenbank
nutzen. Die Interaktions-KI sollte zusaetzlich den Vektorindex nutzen, um
Dokumentation und fruehere Erklaerungen wiederzufinden.

## Datenfluss

### Berechnungs-KI

1. Nutzer oder UI startet Optimierung.
2. Berechnungs-KI liest Missionszustand, bisherige Logs und Zielparameter.
3. Berechnungs-KI erzeugt strukturierte Kandidatenbereiche.
4. Klassischer Solver berechnet die Kandidaten.
5. Ergebnis wird voll validiert.
6. Plausibilitaets-KI prueft Ergebnis und Darstellung.
7. Interaktions-KI erklaert das Ergebnis.

### Interaktions-KI

1. Nutzer fragt per Text oder Sprache.
2. Eingabe wird in Intent und Parameter extrahiert.
3. Bei Rechenbedarf wird ein Solver- oder Berechnungs-KI-Aufruf vorbereitet.
4. Nutzer bestaetigt relevante Aenderungen.
5. Ergebnis wird als Text und optional Sprache ausgegeben.

### Plausibilitaets-KI

1. Nach jedem Solver-Lauf wird ein Pruefauftrag erzeugt.
2. KI liest Solver-JSON, Audit, UI-State und View-Metadaten.
3. Ergebnis ist ein strukturierter Bericht:
   - `status`: `pass`, `warning`, `fail`
   - `findings`
   - `requiredFixes`
   - `displaySafe`
4. UI darf eine Route nur dann als freigegeben darstellen, wenn Solver und
   Plausibilitaetspruefung kompatibel sind.

## Sicherheitsregeln

- Der Solver bleibt autoritativ.
- Jede KI-Aussage zu Missionswerten muss auf einem konkreten Solver-Lauf oder
  Audit-Eintrag basieren.
- KI-generierte Parameter muessen als Vorschlag markiert werden.
- Rechenlaeufe muessen reproduzierbar sein.
- Jeder KI-Aufruf wird mit Input, Output, Modellname, Zeitstempel und Run-ID
  protokolliert.
- Langzeitwissen wird nicht in freien Prompts versteckt, sondern ueber
  versionierte Logs, Graphdatenbank und optionalen Vektorindex referenziert.
- Grapheintraege muessen auf konkrete Solver-Laeufe, Audit-IDs oder
  Dokumentquellen verweisen.
- Bei Konflikt zwischen KI und Solver gewinnt der Solver.
- Bei Konflikt zwischen UI und Audit wird eine Plausibilitaetswarnung angezeigt.

## Umsetzungsschritte

### Phase 1: Ehrliche UI und Schnittstellen

- Bestehende "KI"-Labels in "Optimierer" oder "Solver-Suche" umbenennen.
- Neue KI-Sektion im UI erst anzeigen, wenn echte KI-Endpunkte existieren.
- JSON-Schemas fuer Missionszustand, Solver-Ergebnis, KI-Vorschlag und
  Plausibilitaetsbericht definieren.
- Audit-Logging fuer KI-Laeufe vorbereiten.

### Phase 2: Interaktions-KI

- Chat-Endpunkt bauen.
- Missionszustand als Kontext uebergeben.
- Tool-Aufrufe nur fuer erlaubte Aktionen zulassen.
- Textantwort mit Bezug auf konkrete Solver-Ergebnisse erzeugen.
- Optional Speech-to-Text und Text-to-Speech anbinden.

### Phase 3: Plausibilitaets-KI

- Pruefbericht nach jedem Optimierer- und Routenlauf erzeugen.
- UI-State und Solver-State vergleichen.
- Warnungen sichtbar in der UI anzeigen.
- Tests fuer absichtlich widerspruechliche Daten ergaenzen.

### Phase 4: Berechnungs-KI

- Bestehende Optimierung als Tool kapseln.
- Berechnungs-KI darf nur Suchraeume und Kandidaten erzeugen.
- Kandidaten werden vom Solver berechnet und validiert.
- Ergebnisse werden mit bisherigen Logs verglichen.
- ML-Priorisierung auf Basis historischer Solver-Laeufe vorbereiten.

### Phase 5: ML-Verbesserung

- Dataset aus JSONL-Logs normalisieren.
- Features und Zielgroessen definieren.
- Modell fuer Kandidatenranking oder Fehlschlagwahrscheinlichkeit trainieren.
- Modell nur als Priorisierung nutzen, nicht als Wahrheit.
- Offline-Evaluation gegen Test-Szenarien aufbauen.

## Akzeptanzkriterien

Die Integration gilt erst dann als echte KI-Erweiterung, wenn:

- mindestens ein LLM-Endpunkt angebunden ist
- die drei Rollen getrennte Prompts und Berechtigungen haben
- KI-Ausgaben auditiert werden
- User-Eingaben in Missionsaktionen uebersetzt werden koennen
- Solver-Ergebnisse erklaert, aber nicht erfunden werden
- Plausibilitaetspruefungen Widersprueche zwischen UI und Berechnung erkennen
- die Berechnungs-KI nachweislich bessere Kandidaten oder schnellere
  Konvergenz gegenueber der reinen Raster-/Heuristiksuche liefert

## Wichtigste Leitlinie

Die KI soll nicht "magisch rechnen". Sie soll den vorhandenen physikalischen
Solver besser bedienen, die Bedienung menschlicher machen und die Ergebnisse
strenger kontrollieren.
