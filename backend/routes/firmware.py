from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
from models import firmware_schema

firmware_bp = Blueprint("firmware", __name__, url_prefix="/api/firmware")

def init_firmware(db):
    @firmware_bp.route("", methods=["GET"])
    def list_all():
        q = {}
        if request.args.get("platform"):     q["platform"] = request.args["platform"]
        if request.args.get("model_family"):  q["model_family"] = request.args["model_family"]
        rows = list(db.firmware.find(q).sort("release_date", -1))
        for r in rows: r["_id"] = str(r["_id"])
        return jsonify(rows)

    @firmware_bp.route("", methods=["POST"])
    def create():
        d = request.json
        for f in ["platform","model_family","version","filename"]:
            if not d.get(f): return jsonify({"error": f"'{f}' required"}), 400
        if d.get("release_date") and isinstance(d["release_date"], str):
            try: d["release_date"] = datetime.fromisoformat(d["release_date"].replace("Z","+00:00"))
            except: pass
        doc = firmware_schema(d)
        res = db.firmware.insert_one(doc)
        doc["_id"] = str(res.inserted_id)
        return jsonify(doc), 201

    @firmware_bp.route("/<fid>", methods=["DELETE"])
    def delete(fid):
        r = db.firmware.delete_one({"_id": ObjectId(fid)})
        if r.deleted_count == 0: return jsonify({"error": "Not found"}), 404
        return jsonify({"message": "Deleted"})

    @firmware_bp.route("/platforms", methods=["GET"])
    def platforms():
        return jsonify({
            "platforms": db.firmware.distinct("platform"),
            "model_families": db.firmware.distinct("model_family"),
        })

    return firmware_bp
