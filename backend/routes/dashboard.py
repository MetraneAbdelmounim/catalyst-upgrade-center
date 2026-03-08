from flask import Blueprint, jsonify

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")

def init_dashboard(db):
    @dashboard_bp.route("/stats", methods=["GET"])
    def stats():
        ts = db.switches.count_documents({})
        on = db.switches.count_documents({"status": "online"})
        off = db.switches.count_documents({"status": "offline"})
        upg = db.switches.count_documents({"status": "upgrading"})
        tu = db.upgrade_history.count_documents({})
        su = db.upgrade_history.count_documents({"status": "success"})
        fa = db.upgrade_history.count_documents({"status": "failed"})
        ru = db.upgrade_history.count_documents({"status": "running"})

        sites = [{"name": s["_id"] or "—", "count": s["count"]}
                 for s in db.switches.aggregate([{"$group":{"_id":"$site","count":{"$sum":1}}},{"$sort":{"count":-1}}])]
        platforms = [{"name": p["_id"] or "—", "count": p["count"]}
                     for p in db.switches.aggregate([{"$group":{"_id":"$platform","count":{"$sum":1}}},{"$sort":{"count":-1}}])]
        versions = [{"version": v["_id"] or "—", "count": v["count"]}
                    for v in db.switches.aggregate([{"$group":{"_id":"$current_version","count":{"$sum":1}}},{"$sort":{"count":-1}},{"$limit":10}])]
        recent = list(db.upgrade_history.find({},{"steps":0}).sort("created_at",-1).limit(10))
        for r in recent: r["_id"] = str(r["_id"])

        return jsonify({
            "switches": {"total": ts, "online": on, "offline": off, "upgrading": upg, "unknown": ts-on-off-upg},
            "firmware": {"total": db.firmware.count_documents({})},
            "upgrades": {"total": tu, "successful": su, "failed": fa, "running": ru,
                         "success_rate": round(su/tu*100,1) if tu else 0},
            "sites": sites, "platforms": platforms, "versions": versions,
            "recent_upgrades": recent,
        })
    return dashboard_bp
