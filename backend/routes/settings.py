from flask import Blueprint, request, jsonify, g
from datetime import datetime, timezone
import socket
import subprocess
import threading

settings_bp = Blueprint("settings", __name__, url_prefix="/api/settings")


# Default settings
DEFAULTS = {
    "transfer_method": "http",       # http, tftp, sftp
    "http_server": "",               # IP of HTTP server
    "http_port": 8080,
    "tftp_server": "",               # IP of TFTP server
    "sftp_server": "",               # IP of SFTP server
    "sftp_port": 22,
    "sftp_username": "",
    "sftp_password": "",
    "sftp_path": "",                 # remote directory on SFTP server
    "firmware_dir": "",              # local path to firmware files
    "simulation_mode": True,
    "health_check_interval": 60,     # seconds, 0=disabled
    "ping_timeout": 2,
    "max_parallel_upgrades": 5,      # how many switches upgrade at once
    "ssh_default_username": "admin",
    "ssh_default_password": "",
    "ssh_default_enable": "",
    "setup_complete": False,         # becomes True after first-time wizard
}


def init_settings(db):

    def _get_all():
        """Get all settings from DB, merged with defaults."""
        doc = db.app_settings.find_one({"_id": "config"}) or {}
        result = {}
        for key, default in DEFAULTS.items():
            result[key] = doc.get(key, default)
        return result

    def _get(key):
        """Get a single setting value."""
        doc = db.app_settings.find_one({"_id": "config"})
        if doc and key in doc:
            return doc[key]
        return DEFAULTS.get(key)

    def _set_many(updates: dict):
        """Update multiple settings."""
        updates["updated_at"] = datetime.now(timezone.utc)
        db.app_settings.update_one(
            {"_id": "config"},
            {"$set": updates},
            upsert=True
        )

    # Expose getter for other modules
    settings_bp._get = _get
    settings_bp._get_all = _get_all

    @settings_bp.route("", methods=["GET"])
    def get_settings():
        """Get all settings. Admin only."""
        if g.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403
        return jsonify(_get_all())

    @settings_bp.route("", methods=["PUT"])
    def update_settings():
        """Update settings. Admin only."""
        if g.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403
        d = request.json or {}

        updates = {}
        # Validate and sanitize
        if "transfer_method" in d and d["transfer_method"] in ("http", "tftp", "sftp"):
            updates["transfer_method"] = d["transfer_method"]
        if "http_server" in d:
            updates["http_server"] = str(d["http_server"]).strip()
        if "http_port" in d:
            try: updates["http_port"] = int(d["http_port"])
            except: pass
        if "tftp_server" in d:
            updates["tftp_server"] = str(d["tftp_server"]).strip()
        if "sftp_server" in d:
            updates["sftp_server"] = str(d["sftp_server"]).strip()
        if "sftp_port" in d:
            try: updates["sftp_port"] = int(d["sftp_port"])
            except: pass
        if "sftp_username" in d:
            updates["sftp_username"] = str(d["sftp_username"]).strip()
        if "sftp_password" in d:
            updates["sftp_password"] = str(d["sftp_password"])
        if "sftp_path" in d:
            updates["sftp_path"] = str(d["sftp_path"]).strip()
        if "firmware_dir" in d:
            updates["firmware_dir"] = str(d["firmware_dir"]).strip()
        if "simulation_mode" in d:
            updates["simulation_mode"] = bool(d["simulation_mode"])
        if "health_check_interval" in d:
            try: updates["health_check_interval"] = int(d["health_check_interval"])
            except: pass
        if "ping_timeout" in d:
            try: updates["ping_timeout"] = int(d["ping_timeout"])
            except: pass
        if "max_parallel_upgrades" in d:
            try:
                val = int(d["max_parallel_upgrades"])
                updates["max_parallel_upgrades"] = max(1, min(val, 20))
            except: pass
        if "ssh_default_username" in d:
            updates["ssh_default_username"] = str(d["ssh_default_username"]).strip()
        if "ssh_default_password" in d:
            updates["ssh_default_password"] = str(d["ssh_default_password"])
        if "ssh_default_enable" in d:
            updates["ssh_default_enable"] = str(d["ssh_default_enable"])
        if "setup_complete" in d:
            updates["setup_complete"] = bool(d["setup_complete"])

        if updates:
            _set_many(updates)

        return jsonify(_get_all())

    @settings_bp.route("/test-connectivity", methods=["POST"])
    def test_connectivity():
        """Test connectivity to transfer server (HTTP/TFTP).
        Also tests if firmware file is reachable."""
        if g.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403

        d = request.json or {}
        method = d.get("transfer_method", _get("transfer_method"))
        results = {"method": method, "tests": []}

        if method == "http":
            host = d.get("http_server") or _get("http_server")
            port = d.get("http_port") or _get("http_port")
            try:
                port = int(port)
            except:
                port = 8080

            # Test 1: TCP connection to HTTP server
            try:
                sock = socket.create_connection((host, port), timeout=5)
                sock.close()
                results["tests"].append({
                    "test": f"TCP connect to {host}:{port}",
                    "status": "pass",
                    "detail": "HTTP server is reachable"
                })
            except Exception as e:
                results["tests"].append({
                    "test": f"TCP connect to {host}:{port}",
                    "status": "fail",
                    "detail": str(e)
                })

            # Test 2: HTTP GET to check if server responds
            try:
                import http.client
                conn = http.client.HTTPConnection(host, port, timeout=5)
                conn.request("GET", "/")
                resp = conn.getresponse()
                results["tests"].append({
                    "test": f"HTTP GET http://{host}:{port}/",
                    "status": "pass",
                    "detail": f"HTTP {resp.status} {resp.reason}"
                })
                conn.close()
            except Exception as e:
                results["tests"].append({
                    "test": f"HTTP GET http://{host}:{port}/",
                    "status": "fail",
                    "detail": str(e)
                })

            # Test 3: Check specific firmware file if requested
            fw_file = d.get("test_file")
            if fw_file:
                try:
                    import http.client
                    conn = http.client.HTTPConnection(host, port, timeout=5)
                    conn.request("HEAD", f"/{fw_file}")
                    resp = conn.getresponse()
                    if resp.status == 200:
                        size = resp.getheader("Content-Length", "?")
                        results["tests"].append({
                            "test": f"File: {fw_file}",
                            "status": "pass",
                            "detail": f"Found ({size} bytes)"
                        })
                    else:
                        results["tests"].append({
                            "test": f"File: {fw_file}",
                            "status": "fail",
                            "detail": f"HTTP {resp.status}"
                        })
                    conn.close()
                except Exception as e:
                    results["tests"].append({
                        "test": f"File: {fw_file}",
                        "status": "fail",
                        "detail": str(e)
                    })

        elif method == "tftp":
            host = d.get("tftp_server") or _get("tftp_server")
            # Test: UDP port 69 reachable (just ping the host)
            try:
                sock = socket.create_connection((host, 69), timeout=5)
                sock.close()
                results["tests"].append({
                    "test": f"TCP connect to {host}:69",
                    "status": "pass",
                    "detail": "TFTP server port reachable"
                })
            except Exception:
                # TFTP is UDP, TCP connect will fail — just ping instead
                try:
                    param = "-n" if subprocess.os.name == "nt" else "-c"
                    result = subprocess.run(
                        ["ping", param, "1", "-W", "2", host],
                        capture_output=True, text=True, timeout=5
                    )
                    if result.returncode == 0:
                        results["tests"].append({
                            "test": f"Ping {host}",
                            "status": "pass",
                            "detail": "TFTP server host is reachable"
                        })
                    else:
                        results["tests"].append({
                            "test": f"Ping {host}",
                            "status": "fail",
                            "detail": "Host unreachable"
                        })
                except Exception as e:
                    results["tests"].append({
                        "test": f"Ping {host}",
                        "status": "fail",
                        "detail": str(e)
                    })

        elif method == "sftp":
            host = d.get("sftp_server") or _get("sftp_server")
            port = d.get("sftp_port") or _get("sftp_port") or 22
            sftp_user = d.get("sftp_username") or _get("sftp_username")
            try:
                port = int(port)
            except:
                port = 22

            # Test 1: TCP connect to SSH port
            try:
                sock = socket.create_connection((host, port), timeout=5)
                sock.close()
                results["tests"].append({
                    "test": f"TCP connect to {host}:{port}",
                    "status": "pass",
                    "detail": "SFTP server SSH port is reachable"
                })
            except Exception as e:
                results["tests"].append({
                    "test": f"TCP connect to {host}:{port}",
                    "status": "fail",
                    "detail": str(e)
                })

            # Test 2: SSH authentication
            sftp_pass = d.get("sftp_password") or _get("sftp_password")
            if sftp_user and sftp_pass:
                try:
                    import paramiko
                    ssh = paramiko.SSHClient()
                    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                    ssh.connect(host, port=port, username=sftp_user, password=sftp_pass, timeout=5)
                    sftp = ssh.open_sftp()
                    # List remote directory
                    remote_path = d.get("sftp_path") or _get("sftp_path") or "."
                    try:
                        file_list = sftp.listdir(remote_path)
                        bin_files = [f for f in file_list if f.endswith(('.bin', '.tar', '.pkg'))]
                        results["tests"].append({
                            "test": f"SFTP login as {sftp_user}",
                            "status": "pass",
                            "detail": f"Authenticated — {len(bin_files)} firmware file(s) in {remote_path}"
                        })
                    except Exception:
                        results["tests"].append({
                            "test": f"SFTP login as {sftp_user}",
                            "status": "pass",
                            "detail": f"Authenticated (could not list path: {remote_path})"
                        })
                    sftp.close()
                    ssh.close()
                except Exception as e:
                    results["tests"].append({
                        "test": f"SFTP login as {sftp_user}",
                        "status": "fail",
                        "detail": str(e)
                    })

            # Test 3: Check specific firmware file
            fw_file = d.get("test_file")
            if fw_file and sftp_user and sftp_pass:
                try:
                    import paramiko
                    ssh = paramiko.SSHClient()
                    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                    ssh.connect(host, port=port, username=sftp_user, password=sftp_pass, timeout=5)
                    sftp = ssh.open_sftp()
                    remote_path = d.get("sftp_path") or _get("sftp_path") or ""
                    remote_file = f"{remote_path}/{fw_file}" if remote_path else fw_file
                    stat = sftp.stat(remote_file)
                    results["tests"].append({
                        "test": f"File: {fw_file}",
                        "status": "pass",
                        "detail": f"Found ({stat.st_size} bytes)"
                    })
                    sftp.close()
                    ssh.close()
                except Exception as e:
                    results["tests"].append({
                        "test": f"File: {fw_file}",
                        "status": "fail",
                        "detail": str(e)
                    })

        # Overall status
        results["overall"] = "pass" if all(t["status"] == "pass" for t in results["tests"]) else "fail"
        return jsonify(results)

    @settings_bp.route("/setup-status", methods=["GET"])
    def setup_status():
        """Check if initial setup is complete. Public endpoint."""
        return jsonify({
            "setup_complete": _get("setup_complete"),
        })

    return settings_bp