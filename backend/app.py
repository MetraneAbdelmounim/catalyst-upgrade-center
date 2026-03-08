"""
Cisco Switch Upgrade Manager — Flask Backend
Run:  python app.py
Prod: SIMULATION_MODE=false gunicorn -w 4 -b 0.0.0.0:5000 app:app
Seed: python -c "from app import create_app; from utils import seed; from pymongo import MongoClient; c=MongoClient('mongodb://localhost:27017/cisco_upgrade_manager'); seed(c.get_default_database())"
"""
import os, logging
from flask import Flask, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from config import Config
from routes import init_switches, init_firmware, init_upgrades, init_dashboard

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("app")

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    client = MongoClient(app.config["MONGO_URI"])
    db = client.get_default_database()
    log.info(f"MongoDB connected: {app.config['MONGO_URI']}")

    # No demo/simulation data seeded — database starts empty.
    # Add switches and firmware through the UI or API.
    # To seed demo data manually, run:  python seed_demo.py

    os.makedirs(app.config.get("FIRMWARE_DIR", "firmware_images"), exist_ok=True)

    sim = app.config.get("SIMULATION_MODE", True)
    app.register_blueprint(init_switches(db))
    app.register_blueprint(init_firmware(db))
    app.register_blueprint(init_upgrades(db, simulation=sim))
    app.register_blueprint(init_dashboard(db))

    # Create indexes (idempotent — safe to run every startup)
    db.switches.create_index("ip_address", unique=True)
    db.switches.create_index("status")
    db.firmware.create_index([("platform", 1), ("model_family", 1)])
    db.upgrade_history.create_index("job_id", unique=True)
    db.upgrade_history.create_index("created_at")

    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok", "simulation": sim})

    # Start background switch health checker (pings all switches every N seconds)
    from services.health_checker import start_background_checker
    interval = app.config.get("HEALTH_CHECK_INTERVAL", 60)
    ping_timeout = app.config.get("PING_TIMEOUT", 2)
    start_background_checker(db, interval=interval, ping_timeout=ping_timeout)

    log.info(f"Ready — simulation_mode={sim}, health_check_interval={interval}s")
    return app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)
