import os

class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "cisco-upgrade-secret")
    MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/cisco_upgrade_manager")
    # Directory where firmware .bin files are stored on this server
    FIRMWARE_DIR = os.environ.get("FIRMWARE_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "firmware_images"))
    SIMULATION_MODE = os.environ.get("SIMULATION_MODE", "false").lower() == "true"
    TFTP_SERVER = os.environ.get("TFTP_SERVER", "10.190.100.102")
    # Transfer method: "http" (fastest), "scp" (encrypted), "tftp" (legacy)
    TRANSFER_METHOD = os.environ.get("TRANSFER_METHOD", "http")
    # HTTP server settings (your existing HTTP server serving firmware files)
    HTTP_SERVER = os.environ.get("HTTP_SERVER", "10.190.100.102")
    HTTP_PORT = int(os.environ.get("HTTP_PORT", "8080"))
    SSH_TIMEOUT = 30
    HEALTH_CHECK_INTERVAL = int(os.environ.get("HEALTH_CHECK_INTERVAL", "60"))
    PING_TIMEOUT = int(os.environ.get("PING_TIMEOUT", "2"))