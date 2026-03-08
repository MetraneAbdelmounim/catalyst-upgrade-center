import json, time
from flask import Blueprint, request, jsonify, Response
from bson import ObjectId
from services import start_upgrade, start_batch_upgrade, get_job, get_all_active, get_batch

upgrades_bp = Blueprint("upgrades", __name__, url_prefix="/api/upgrades")

def init_upgrades(db, simulation=True):
    @upgrades_bp.route("/start", methods=["POST"])
    def start():
        d = request.json
        sids = d.get("switch_ids", [])
        fid = d.get("firmware_id")
        if not sids or not fid:
            return jsonify({"error": "switch_ids and firmware_id required"}), 400
        fw = db.firmware.find_one({"_id": ObjectId(fid)})
        if not fw: return jsonify({"error": "Firmware not found"}), 404

        sw_docs = []
        for sid in sids:
            sw = db.switches.find_one({"_id": ObjectId(sid)})
            if sw and sw.get("status") != "upgrading":
                sw_docs.append(sw)
        if not sw_docs:
            return jsonify({"error": "No valid switches"}), 400

        batch_id, job_metas = start_batch_upgrade(db, sw_docs, fw, simulation=simulation)
        return jsonify({"batch_id": batch_id, "jobs": job_metas}), 202

    @upgrades_bp.route("/batch/<batch_id>", methods=["GET"])
    def batch_status(batch_id):
        b = get_batch(batch_id)
        if not b: return jsonify({"error": "Batch not found"}), 404
        return jsonify(b)

    @upgrades_bp.route("/progress/<job_id>", methods=["GET"])
    def progress(job_id):
        job = get_job(job_id)
        if job: return jsonify(job)
        h = db.upgrade_history.find_one({"job_id": job_id})
        if h:
            h["_id"] = str(h["_id"])
            return jsonify(h)
        return jsonify({"error": "Not found"}), 404

    @upgrades_bp.route("/progress/<job_id>/stream", methods=["GET"])
    def stream(job_id):
        def gen():
            last = -1
            while True:
                job = get_job(job_id)
                if not job:
                    yield f"data: {json.dumps({'status':'not_found'})}\n\n"
                    break
                if job["overall_progress"] != last or job["status"] in ("success","failed"):
                    last = job["overall_progress"]
                    yield f"data: {json.dumps(job, default=str)}\n\n"
                if job["status"] in ("success","failed"):
                    break
                time.sleep(0.8)
        return Response(gen(), mimetype="text/event-stream",
                        headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

    @upgrades_bp.route("/active", methods=["GET"])
    def active():
        return jsonify(get_all_active())

    @upgrades_bp.route("/history", methods=["GET"])
    def history():
        q = {}
        if request.args.get("switch_id"): q["switch_id"] = request.args["switch_id"]
        if request.args.get("status"):    q["status"] = request.args["status"]
        lim = int(request.args.get("limit", 50))
        rows = list(db.upgrade_history.find(q).sort("created_at", -1).limit(lim))
        for r in rows: r["_id"] = str(r["_id"])
        return jsonify(rows)

    return upgrades_bp
