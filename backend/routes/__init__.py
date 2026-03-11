from .switches import switches_bp, init_switches
from .firmware import firmware_bp, init_firmware
from .upgrades import upgrades_bp, init_upgrades
from .dashboard import dashboard_bp, init_dashboard
from .auth import auth_bp, init_auth, jwt_required
from .settings import settings_bp, init_settings