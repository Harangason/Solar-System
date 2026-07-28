from pathlib import Path

from flask import Flask, jsonify, request, send_file, send_from_directory

from ephemeris import get_ephemeris_status
from calculation_audit import (
    METHOD_DOCUMENTATION,
    OPTIMIZER_AUDIT_LOG,
    PLAYBACK_AUDIT_LOG,
    ROUTE_AUDIT_LOG,
    read_latest_optimizer_audit,
    read_latest_playback_audit,
    read_latest_route_audit,
    start_playback_audit,
    write_playback_event,
)
from trajectory import get_default_mission_config, simulate_mission
from route_planner import simulate_waypoint_route
from multi_route_planner import simulate_route_sections
from mission_optimizer import assess_solar_energy, optimize_launch_window
from project_store import ProjectStore
from view_2d_celestials import render_2d_view
from view_3d_celestials import get_solar_system_data


PORT = 5001

WEB_DIST = Path(__file__).parent / "web" / "dist"
app = Flask(__name__, static_folder=None)
project_store = ProjectStore()


@app.after_request
def disable_local_browser_cache(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@app.get("/api/solar-system")
def solar_system_data():
    return jsonify(get_solar_system_data())


@app.get("/api/ephemeris/status")
def ephemeris_status():
    try:
        return jsonify(get_ephemeris_status())
    except RuntimeError as error:
        return jsonify({"error": str(error), "active": False}), 503


@app.get("/api/view/2d")
def two_dimensional_view():
    return send_file(render_2d_view(), mimetype="image/png", max_age=0)


@app.get("/api/mission/defaults")
def mission_defaults():
    return jsonify(get_default_mission_config())


@app.get("/api/projects")
def list_projects():
    return jsonify({"projects": project_store.list_projects()})


@app.get("/api/projects/<project_id>")
def load_project(project_id: str):
    try:
        return jsonify(project_store.get_project(project_id))
    except LookupError as error:
        return jsonify({"error": str(error)}), 404


@app.post("/api/projects")
def create_project():
    try:
        return jsonify(project_store.create_project(request.get_json(silent=True) or {})), 201
    except (TypeError, ValueError) as error:
        return jsonify({"error": str(error)}), 400


@app.put("/api/projects/<project_id>")
def update_project(project_id: str):
    try:
        return jsonify(project_store.update_project(project_id, request.get_json(silent=True) or {}))
    except LookupError as error:
        return jsonify({"error": str(error)}), 404
    except (TypeError, ValueError) as error:
        return jsonify({"error": str(error)}), 400


@app.delete("/api/projects/<project_id>")
def delete_project(project_id: str):
    try:
        project_store.delete_project(project_id)
        return "", 204
    except LookupError as error:
        return jsonify({"error": str(error)}), 404


@app.post("/api/mission/simulate")
def mission_simulation():
    try:
        result = simulate_mission(request.get_json(silent=True) or {})
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except RuntimeError as error:
        return jsonify({"error": str(error)}), 422
    return jsonify(result.to_dict())


@app.post("/api/route/simulate")
def waypoint_route_simulation():
    try:
        values = request.get_json(silent=True) or {}
        if values.get("routeSections"):
            return jsonify(simulate_route_sections(values))
        return jsonify(simulate_waypoint_route(values))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except RuntimeError as error:
        return jsonify({"error": str(error)}), 422


@app.get("/api/audit/latest-route")
def latest_route_audit():
    record = read_latest_route_audit()
    if record is None:
        return jsonify({"error": "Noch keine Routenberechnung protokolliert."}), 404
    return jsonify(record)


@app.get("/api/audit/route-log")
def route_audit_log():
    if not ROUTE_AUDIT_LOG.exists():
        return jsonify({"error": "Noch keine Routenberechnung protokolliert."}), 404
    return send_file(ROUTE_AUDIT_LOG, mimetype="application/x-ndjson", as_attachment=True)


@app.get("/api/audit/latest-optimizer")
def latest_optimizer_audit():
    record = read_latest_optimizer_audit()
    if record is None:
        return jsonify({"error": "Noch keine Navigatorsuche protokolliert."}), 404
    return jsonify(record)


@app.get("/api/audit/optimizer-log")
def optimizer_audit_log():
    if not OPTIMIZER_AUDIT_LOG.exists():
        return jsonify({"error": "Noch keine Navigatorsuche protokolliert."}), 404
    return send_file(OPTIMIZER_AUDIT_LOG, mimetype="application/x-ndjson", as_attachment=True)


@app.post("/api/audit/playback/start")
def start_playback_log():
    try:
        return jsonify(start_playback_audit(request.get_json(silent=True) or {}))
    except (TypeError, ValueError) as error:
        return jsonify({"error": str(error)}), 400


@app.post("/api/audit/playback/event")
def append_playback_log_event():
    try:
        return jsonify(write_playback_event(request.get_json(silent=True) or {}))
    except (TypeError, ValueError) as error:
        return jsonify({"error": str(error)}), 400


@app.get("/api/audit/latest-playback")
def latest_playback_audit():
    record = read_latest_playback_audit()
    if record is None:
        return jsonify({"error": "Noch kein Missionslauf protokolliert."}), 404
    return jsonify(record)


@app.get("/api/audit/playback-log")
def playback_audit_log():
    if not PLAYBACK_AUDIT_LOG.exists():
        return jsonify({"error": "Noch kein Missionslauf protokolliert."}), 404
    return send_file(
        PLAYBACK_AUDIT_LOG,
        mimetype="application/x-ndjson",
        as_attachment=True,
        download_name="mission_playback.jsonl",
    )


@app.get("/api/audit/methods")
def calculation_methods():
    return send_file(METHOD_DOCUMENTATION, mimetype="text/markdown; charset=utf-8")


@app.post("/api/mission/optimize-launch-window")
def launch_window_optimization():
    try:
        return jsonify(optimize_launch_window(request.get_json(silent=True) or {}))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except RuntimeError as error:
        return jsonify({"error": str(error)}), 422


@app.post("/api/mission/assess-solar-energy")
def solar_energy_assessment():
    try:
        return jsonify(assess_solar_energy(request.get_json(silent=True) or {}))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400


@app.get("/")
@app.get("/<path:requested_path>")
def browser_application(requested_path=""):
    requested_file = WEB_DIST / requested_path
    if requested_path and requested_file.is_file():
        return send_from_directory(WEB_DIST, requested_path)
    return send_from_directory(WEB_DIST, "index.html")


def main():
    if not WEB_DIST.exists():
        raise RuntimeError("Frontend fehlt. Bitte zuerst im Ordner 'web' den Befehl 'npm run build' ausführen.")
    print(f"Sonnensystem wird unter http://127.0.0.1:{PORT} bereitgestellt")
    app.run(host="127.0.0.1", port=PORT, debug=False)


if __name__ == "__main__":
    main()
