"""
Cisco Switch Upgrade Manager — Flask Backend
Run:  python app.py
Prod: SIMULATION_MODE=false gunicorn -w 4 -b 0.0.0.0:5000 app:app
Seed: python -c "from app import create_app; from utils import seed; from pymongo import MongoClient; c=MongoClient('mongodb://localhost:27017/cisco_upgrade_manager'); seed(c.get_default_database())"
"""
import os, logging
from flask import Flask, jsonify, request, g
from flask_cors import CORS
from pymongo import MongoClient
from config import Config
from routes import init_switches, init_firmware, init_upgrades, init_dashboard, init_auth, init_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("app")

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    client = MongoClient(app.config["MONGO_URI"])
    db = client.get_default_database()
    log.info(f"MongoDB connected: {app.config['MONGO_URI']}")

    os.makedirs(app.config.get("FIRMWARE_DIR", "firmware_images"), exist_ok=True)

    sim = app.config.get("SIMULATION_MODE", True)

    # Register blueprints
    app.register_blueprint(init_auth(db))
    settings_bp_inst = init_settings(db)
    app.register_blueprint(settings_bp_inst)
    app.register_blueprint(init_switches(db))
    app.register_blueprint(init_firmware(db))
    app.register_blueprint(init_upgrades(db, simulation=sim))
    app.register_blueprint(init_dashboard(db))

    # Create indexes
    db.switches.create_index("ip_address", unique=True)
    db.switches.create_index("status")
    db.firmware.create_index([("platform", 1), ("model_family", 1)])
    db.upgrade_history.create_index("job_id", unique=True)
    db.upgrade_history.create_index("created_at")
    db.users.create_index("username", unique=True)

    # ── JWT Middleware — protect all /api/* except auth endpoints ──
    PUBLIC_PATHS = {
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/setup-status",
        "/api/health",
        "/api/switches/template",
        "/api/settings/setup-status",
    }

    @app.before_request
    def check_jwt():
        # Skip non-API routes
        if not request.path.startswith("/api/"):
            return None
        # Skip public paths
        if request.path in PUBLIC_PATHS:
            return None
        # Skip OPTIONS (CORS preflight)
        if request.method == "OPTIONS":
            return None

        import jwt as pyjwt
        token = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
        # Also check query param for SSE streams
        if not token:
            token = request.args.get("token")

        if not token:
            return jsonify({"error": "Authentication required"}), 401

        try:
            secret = app.config.get("JWT_SECRET", app.config.get("SECRET_KEY", "change-me"))
            payload = pyjwt.decode(token, secret, algorithms=["HS256"])
            g.user_id = payload.get("sub")
            g.username = payload.get("username")
            g.role = payload.get("role", "operator")
        except pyjwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except pyjwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401

        return None

    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok", "simulation": sim})

    # Start background switch health checker
    from services.health_checker import start_background_checker
    interval = app.config.get("HEALTH_CHECK_INTERVAL", 60)
    ping_timeout = app.config.get("PING_TIMEOUT", 2)
    start_background_checker(db, interval=interval, ping_timeout=ping_timeout)

    log.info(f"Ready — simulation_mode={sim}, health_check_interval={interval}s")
    return app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)