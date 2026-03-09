from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
from models import firmware_schema
import os, re, hashlib

firmware_bp = Blueprint("firmware", __name__, url_prefix="/api/firmware")


def _parse_firmware_filename(filename):
    """Extract platform, model_family, version from Cisco firmware filename.
    Examples:
      cat9k_lite_iosxe.17.15.04.SPA.bin → IOS-XE, Catalyst 9200, 17.15.04
      cat9k_iosxe.17.12.04.SPA.bin      → IOS-XE, Catalyst 9300, 17.12.04
      cat3k_caa-universalk9.16.12.08.SPA.bin → IOS-XE, Catalyst 3850, 16.12.08
      c3850-universalk9.16.12.08.SPA.bin     → IOS-XE, Catalyst 3850, 16.12.08
      nxos64.10.3.4.M.bin               → NX-OS, Nexus 9000, 10.3.4
    """
    name = filename.lower()
    platform = "IOS-XE"
    model_family = ""
    version = ""

    # Detect NX-OS
    if "nxos" in name:
        platform = "NX-OS"
        model_family = "Nexus 9000"
        m = re.search(r'(\d+\.\d+\.\d+)', name)
        if m:
            version = m.group(1)
        return platform, model_family, version

    # Detect model family from filename prefix
    if "cat9k_lite" in name:
        model_family = "Catalyst 9200"
    elif "cat9k_" in name or "cat9k-" in name:
        model_family = "Catalyst 9300"
    elif "cat3k" in name or "c3850" in name:
        model_family = "Catalyst 3850"
    elif "c3560" in name:
        model_family = "Catalyst 3560"
        platform = "IOS"
    elif "c2960" in name:
        model_family = "Catalyst 2960"
        platform = "IOS"
    elif "c9500" in name or "cat9500" in name:
        model_family = "Catalyst 9500"
    elif "c9400" in name or "cat9400" in name:
        model_family = "Catalyst 9400"
    elif "c9600" in name or "cat9600" in name:
        model_family = "Catalyst 9600"
    elif "asr" in name:
        model_family = "ASR 1000"
    elif "isr" in name:
        model_family = "ISR 4000"

    # Extract version: look for patterns like 17.15.04 or 16.12.08 or 17.12.4
    m = re.search(r'(\d{2}\.\d{1,2}\.\d{1,2})', name)
    if m:
        version = m.group(1)

    return platform, model_family, version


def _compute_md5(filepath, chunk_size=8192):
    """Compute MD5 hash of a file."""
    h = hashlib.md5()
    with open(filepath, 'rb') as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


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

    @firmware_bp.route("/scan", methods=["POST"])
    def scan_directory():
        """Scan the firmware directory for .bin files and auto-detect info.
        Returns list of detected firmware with option to import."""
        from config import Config
        firmware_dir = Config.FIRMWARE_DIR

        if not os.path.isdir(firmware_dir):
            return jsonify({"error": f"Firmware directory not found: {firmware_dir}"}), 400

        found = []
        existing_filenames = set(
            doc["filename"] for doc in db.firmware.find({}, {"filename": 1})
        )

        for fname in os.listdir(firmware_dir):
            if not fname.lower().endswith(('.bin', '.pkg', '.tar')):
                continue

            filepath = os.path.join(firmware_dir, fname)
            if not os.path.isfile(filepath):
                continue

            file_size = os.path.getsize(filepath)
            platform, model_family, version = _parse_firmware_filename(fname)
            mtime = os.path.getmtime(filepath)

            found.append({
                "filename": fname,
                "file_size": file_size,
                "platform": platform,
                "model_family": model_family,
                "version": version,
                "file_date": datetime.fromtimestamp(mtime).isoformat(),
                "already_in_db": fname in existing_filenames,
            })

        found.sort(key=lambda x: x["filename"])
        return jsonify({
            "directory": firmware_dir,
            "total_files": len(found),
            "new_files": sum(1 for f in found if not f["already_in_db"]),
            "files": found,
        })

    @firmware_bp.route("/scan/import", methods=["POST"])
    def scan_import():
        """Import selected scanned files into the firmware database.
        Optionally computes MD5 hash (slow for large files)."""
        from config import Config
        firmware_dir = Config.FIRMWARE_DIR
        files = request.json.get("files", [])
        compute_md5 = request.json.get("compute_md5", False)

        imported = 0
        for f in files:
            fname = f.get("filename", "")
            if not fname:
                continue
            # Skip if already exists
            if db.firmware.find_one({"filename": fname}):
                continue

            filepath = os.path.join(firmware_dir, fname)
            if not os.path.isfile(filepath):
                continue

            file_size = f.get("file_size") or os.path.getsize(filepath)
            platform = f.get("platform", "IOS-XE")
            model_family = f.get("model_family", "")
            version = f.get("version", "")

            md5 = ""
            if compute_md5:
                try:
                    md5 = _compute_md5(filepath)
                except Exception:
                    pass

            doc = firmware_schema({
                "platform": platform,
                "model_family": model_family,
                "version": version,
                "filename": fname,
                "file_size": file_size,
                "md5_hash": md5,
            })
            db.firmware.insert_one(doc)
            imported += 1

        return jsonify({"imported": imported})

    @firmware_bp.route("/detect", methods=["POST"])
    def detect_from_filename():
        """Auto-detect firmware info from a filename string."""
        fname = request.json.get("filename", "")
        if not fname:
            return jsonify({"error": "filename required"}), 400

        platform, model_family, version = _parse_firmware_filename(fname)

        # Check if file exists in firmware_dir to get size
        from config import Config
        filepath = os.path.join(Config.FIRMWARE_DIR, fname)
        file_size = 0
        if os.path.isfile(filepath):
            file_size = os.path.getsize(filepath)

        return jsonify({
            "filename": fname,
            "platform": platform,
            "model_family": model_family,
            "version": version,
            "file_size": file_size,
        })

    return firmware_bp