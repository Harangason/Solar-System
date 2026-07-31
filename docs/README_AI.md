# AI

Zurueck zum [Dokumentationsindex](README.md).

Das Paket `ai/` ergaenzt die deterministischen Solver. AI-Ausgaben duerfen
Solverwerte erklaeren, referenzieren oder Suchraeume vorschlagen, aber keine
physikalischen Ergebnisse erfinden oder ueberschreiben.

## Komponenten

| Modul | Aufgabe |
| --- | --- |
| `interaction_agent.py` | Missionsdialog und erlaubte UI-Aktionen |
| `plausibility_agent.py` | Modellgestuetzte und deterministische Plausibilitaetspruefung |
| `calculation_agent.py` | Kandidaten, Seeds und Suchraeume fuer Solver |
| `audio_agent.py` | Transkription und Sprachsynthese |
| `schemas.py` | Versionierte JSON-Vertraege |
| `tool_contracts.py` | Allowlist und Validierung von Interaktionsaktionen |
| `audit_log.py` | Rollenbezogene, redigierte AI-Audits |
| `evaluation.py` | Normalisierung, Training und Evaluation des Kandidatenrankers |

## Sicherheitsgrenzen

- Eingaben und Ausgaben werden gegen Schemas beziehungsweise Allowlisten
  validiert.
- Unbekannte Solverreferenzen und unerlaubte Aktionen werden abgewiesen.
- Deterministische Plausibilitaetsbefunde koennen nicht durch ein positives
  Modellurteil aufgehoben werden.
- API-Schluessel und Audiodaten werden nicht in Auditlogs geschrieben.

Die API-Endpunkte liegen in `main.py` unter `/api/ai/*`. Die Phasentests
`tests/test_ai_phase1.py` bis `tests/test_ai_phase5.py` sowie
`tests/test_ai_audio.py` sichern die Vertraege ab.

Die separate Datei `AI_INTEGRATION_INSTRUCTIONS.md` bleibt unveraendert.
