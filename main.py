from pathlib import Path

from flask import Flask, jsonify, request, send_file, send_from_directory

from calculation_audit import (
    METHOD_DOCUMENTATION,
    OPTIMIZER_AUDIT_LOG,
    ROUTE_AUDIT_LOG,
    read_latest_optimizer_audit,
    read_latest_route_audit,
)
from trajectory import get_default_mission_config, simulate_mission
from route_planner import simulate_waypoint_route
from mission_optimizer import optimize_launch_window
from view_2d_celestials import render_2d_view
from view_3d_celestials import get_solar_system_data


PORT = 5001

WEB_DIST = Path(__file__).parent / "web" / "dist"
app = Flask(__name__, static_folder=None)


@app.after_request
def disable_local_browser_cache(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@app.get("/api/solar-system")
def solar_system_data():
    return jsonify(get_solar_system_data())


@app.get("/api/view/2d")
def two_dimensional_view():
    return send_file(render_2d_view(), mimetype="image/png", max_age=0)


@app.get("/api/mission/defaults")
def mission_defaults():
    return jsonify(get_default_mission_config())


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
        return jsonify(simulate_waypoint_route(request.get_json(silent=True) or {}))
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
