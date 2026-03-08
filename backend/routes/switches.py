from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime, timezone
from models import switch_schema

switches_bp = Blueprint("switches", __name__, url_prefix="/api/switches")

def init_switches(db):
    @switches_bp.route("", methods=["GET"])
    def list_all():
        q = {}
        if request.args.get("site"):     q["site"] = request.args["site"]
        if request.args.get("status"):   q["status"] = request.args["status"]
        if request.args.get("platform"): q["platform"] = request.args["platform"]
        if request.args.get("search"):
            s = request.args["search"]
            q["$or"] = [{"name": {"$regex": s, "$options": "i"}},
                        {"ip_address": {"$regex": s, "$options": "i"}},
                        {"model": {"$regex": s, "$options": "i"}}]
        rows = list(db.switches.find(q).sort("name", 1))
        for r in rows: r["_id"] = str(r["_id"])
        return jsonify(rows)

    @switches_bp.route("", methods=["POST"])
    def create():
        d = request.json
        if not d.get("name") or not d.get("ip_address"):
            return jsonify({"error": "name and ip_address required"}), 400
        if db.switches.find_one({"ip_address": d["ip_address"]}):
            return jsonify({"error": "IP already exists"}), 409
        doc = switch_schema(d)
        res = db.switches.insert_one(doc)
        doc["_id"] = str(res.inserted_id)
        return jsonify(doc), 201

    # ── Static paths MUST come before /<sid> ─────────────────

    @switches_bp.route("/check-all", methods=["POST"])
    def check_all():
        """Ping all switches and update their online/offline status."""
        from services.health_checker import check_all_switches
        timeout = int(request.args.get("timeout", 2))
        results = check_all_switches(db, ping_timeout=timeout)
        online = sum(1 for r in results if r.get("new_status") == "online")
        offline = sum(1 for r in results if r.get("new_status") == "offline")
        changed = sum(1 for r in results if r.get("old_status") != r.get("new_status") and not r.get("skipped"))
        return jsonify({
            "total": len(results),
            "online": online,
            "offline": offline,
            "changed": changed,
            "results": results,
        })

    @switches_bp.route("/discover", methods=["POST"])
    def discover():
        d = request.json
        ip = d.get("ip_address", "")
        username = d.get("ssh_username", "admin")
        password = d.get("ssh_password", "")
        if not ip: return jsonify({"error": "ip_address required"}), 400

        hostname = ""

        # 1) Try SSH to get the real configured hostname
        try:
            from netmiko import ConnectHandler
            conn = ConnectHandler(
                device_type="cisco_xe", host=ip,
                username=username, password=password,
                secret=d.get("enable_password", ""),
                timeout=10
            )
            conn.enable()

            # Get hostname from running config
            output = conn.send_command("show run | include ^hostname")
            if output.strip():
                hostname = output.strip().replace("hostname ", "").strip()

            # Also grab model, version, serial from 'show version'
            ver_output = conn.send_command("show version")
            conn.disconnect()

            model = ""
            version = ""
            serial = ""
            platform = "IOS-XE"
            for line in ver_output.splitlines():
                ll = line.lower()
                if "model number" in ll or "cisco " in ll and "processor" in ll:
                    parts = line.split()
                    for p in parts:
                        if p.startswith("C9") or p.startswith("C38") or p.startswith("C36") or p.startswith("N9K"):
                            model = p
                if "version" in ll and ("ios" in ll or "nx-os" in ll):
                    for p in line.split():
                        if p[0:1].isdigit():
                            version = p.strip(",").strip()
                            break
                    if "nx-os" in ll:
                        platform = "NX-OS"
                if "board id" in ll or "system serial" in ll:
                    serial = line.split()[-1]

            return jsonify({
                "name": hostname or f"SW-{ip.replace('.', '-')}",
                "ip_address": ip,
                "model": model or "Unknown",
                "platform": platform,
                "current_version": version or "Unknown",
                "serial_number": serial or "",
                "ssh_username": username,
                "status": "online",
            })

        except Exception as ssh_err:
            # 2) SSH failed — fallback to reverse DNS
            import socket
            if not hostname:
                try:
                    hostname = socket.gethostbyaddr(ip)[0]
                except (socket.herror, socket.gaierror, OSError):
                    hostname = f"SW-{ip.replace('.', '-')}"

            return jsonify({
                "name": hostname,
                "ip_address": ip,
                "model": "Unknown (SSH failed)",
                "platform": "IOS-XE",
                "current_version": "Unknown",
                "serial_number": "",
                "ssh_username": username,
                "status": "unknown",
                "notes": f"Auto-discover SSH failed: {str(ssh_err)[:120]}",
            })

    # ── Dynamic /<sid> paths AFTER all static paths ──────────

    @switches_bp.route("/<sid>", methods=["GET"])
    def get_one(sid):
        sw = db.switches.find_one({"_id": ObjectId(sid)})
        if not sw: return jsonify({"error": "Not found"}), 404
        sw["_id"] = str(sw["_id"])
        return jsonify(sw)

    @switches_bp.route("/<sid>", methods=["PUT"])
    def update(sid):
        d = request.json
        fields = {}
        for k in ["name","ip_address","model","platform","current_version",
                   "serial_number","site","ssh_username","ssh_password",
                   "enable_password","status","notes",
                   "is_stack","stack_count","stack_master","stack_members"]:
            if k in d: fields[k] = d[k]
        fields["updated_at"] = datetime.now(timezone.utc)
        db.switches.update_one({"_id": ObjectId(sid)}, {"$set": fields})
        sw = db.switches.find_one({"_id": ObjectId(sid)})
        sw["_id"] = str(sw["_id"])
        return jsonify(sw)

    @switches_bp.route("/<sid>", methods=["DELETE"])
    def delete(sid):
        r = db.switches.delete_one({"_id": ObjectId(sid)})
        if r.deleted_count == 0: return jsonify({"error": "Not found"}), 404
        return jsonify({"message": "Deleted"})

    @switches_bp.route("/<sid>/check", methods=["POST"])
    def check_one(sid):
        """Ping a single switch and update its status."""
        from services.health_checker import check_switch
        sw = db.switches.find_one({"_id": ObjectId(sid)})
        if not sw:
            return jsonify({"error": "Switch not found"}), 404
        timeout = int(request.args.get("timeout", 2))
        result = check_switch(db, sw, ping_timeout=timeout)
        return jsonify(result)

    return switches_bp
