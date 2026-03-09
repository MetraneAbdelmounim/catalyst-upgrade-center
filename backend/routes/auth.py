from flask import Blueprint, request, jsonify, g
from bson import ObjectId
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
from functools import wraps
from models import user_schema

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _check_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def jwt_required(f):
    """Decorator to protect routes — validates JWT from Authorization header."""
    @wraps(f)
    def decorated(*args, **kwargs):
        from flask import current_app
        token = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

        # Also check query param for SSE endpoints
        if not token:
            token = request.args.get("token")

        if not token:
            return jsonify({"error": "Authentication required"}), 401

        try:
            secret = current_app.config.get("JWT_SECRET", current_app.config.get("SECRET_KEY", "change-me"))
            payload = jwt.decode(token, secret, algorithms=["HS256"])
            g.user_id = payload.get("sub")
            g.username = payload.get("username")
            g.role = payload.get("role", "operator")
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401

        return f(*args, **kwargs)
    return decorated


def init_auth(db):
    secret_key = None  # set from app config in app.py

    @auth_bp.record
    def on_register(state):
        nonlocal secret_key
        secret_key = state.app.config.get("JWT_SECRET", state.app.config.get("SECRET_KEY", "change-me"))

    @auth_bp.route("/register", methods=["POST"])
    def register():
        """Only allowed for first-time setup (no users exist). After that, use User Management."""
        d = request.json or {}
        username = d.get("username", "").strip()
        password = d.get("password", "")
        full_name = d.get("full_name", "").strip()

        # Block registration if users already exist
        user_count = db.users.count_documents({})
        if user_count > 0:
            return jsonify({"error": "Registration disabled. Contact your administrator."}), 403

        if not username or not password:
            return jsonify({"error": "username and password required"}), 400
        if len(password) < 4:
            return jsonify({"error": "Password must be at least 4 characters"}), 400

        doc = user_schema({
            "username": username,
            "password_hash": _hash_password(password),
            "full_name": full_name or username,
            "role": "admin",  # first user is always admin
        })
        result = db.users.insert_one(doc)
        doc["_id"] = str(result.inserted_id)

        return jsonify({
            "message": f"Admin account '{username}' created",
            "user": {"username": username, "full_name": doc["full_name"], "role": "admin"},
        }), 201

    @auth_bp.route("/login", methods=["POST"])
    def login():
        d = request.json or {}
        username = d.get("username", "").strip()
        password = d.get("password", "")

        if not username or not password:
            return jsonify({"error": "username and password required"}), 400

        user = db.users.find_one({"username": username})
        if not user or not _check_password(password, user["password_hash"]):
            return jsonify({"error": "Invalid username or password"}), 401

        # Generate JWT
        payload = {
            "sub": str(user["_id"]),
            "username": user["username"],
            "role": user.get("role", "operator"),
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(hours=24),
        }
        token = jwt.encode(payload, secret_key, algorithm="HS256")

        return jsonify({
            "token": token,
            "user": {
                "id": str(user["_id"]),
                "username": user["username"],
                "full_name": user.get("full_name", ""),
                "role": user.get("role", "operator"),
                "must_change_password": user.get("must_change_password", False),
            }
        })

    @auth_bp.route("/change-password", methods=["POST"])
    @jwt_required
    def change_password():
        """Change own password. Used for first-login forced password reset."""
        d = request.json or {}
        new_password = d.get("new_password", "")
        if not new_password or len(new_password) < 4:
            return jsonify({"error": "New password must be at least 4 characters"}), 400

        db.users.update_one(
            {"_id": ObjectId(g.user_id)},
            {"$set": {
                "password_hash": _hash_password(new_password),
                "must_change_password": False,
                "updated_at": datetime.now(timezone.utc),
            }}
        )
        return jsonify({"message": "Password changed successfully"})

    @auth_bp.route("/me", methods=["GET"])
    @jwt_required
    def me():
        user = db.users.find_one({"_id": ObjectId(g.user_id)})
        if not user:
            return jsonify({"error": "User not found"}), 404
        return jsonify({
            "id": str(user["_id"]),
            "username": user["username"],
            "full_name": user.get("full_name", ""),
            "role": user.get("role", "operator"),
            "must_change_password": user.get("must_change_password", False),
        })

    @auth_bp.route("/setup-status", methods=["GET"])
    def setup_status():
        """Check if any users exist (for initial setup flow)."""
        count = db.users.count_documents({})
        return jsonify({"has_users": count > 0, "user_count": count})

    # ── User Management (admin only) ─────────────────

    @auth_bp.route("/users", methods=["GET"])
    @jwt_required
    def list_users():
        if g.role != "admin":
            return jsonify({"error": "Admin access required"}), 403
        users = list(db.users.find({}, {"password_hash": 0}))
        for u in users:
            u["_id"] = str(u["_id"])
        return jsonify(users)

    @auth_bp.route("/users", methods=["POST"])
    @jwt_required
    def create_user():
        if g.role != "admin":
            return jsonify({"error": "Admin access required"}), 403
        d = request.json or {}
        username = d.get("username", "").strip()
        password = d.get("password", "")
        if not username or not password:
            return jsonify({"error": "username and password required"}), 400
        if len(password) < 4:
            return jsonify({"error": "Password must be at least 4 characters"}), 400
        if db.users.find_one({"username": username}):
            return jsonify({"error": "Username already exists"}), 409

        doc = user_schema({
            "username": username,
            "password_hash": _hash_password(password),
            "full_name": d.get("full_name", username),
            "role": d.get("role", "operator"),
            "must_change_password": True,  # force password change on first login
        })
        result = db.users.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        del doc["password_hash"]
        return jsonify(doc), 201

    @auth_bp.route("/users/<uid>", methods=["PUT"])
    @jwt_required
    def update_user(uid):
        if g.role != "admin":
            return jsonify({"error": "Admin access required"}), 403
        d = request.json or {}
        update = {"updated_at": datetime.now(timezone.utc)}
        if d.get("full_name"):
            update["full_name"] = d["full_name"].strip()
        if d.get("role") and d["role"] in ("admin", "operator"):
            # Prevent removing last admin
            if d["role"] != "admin":
                admin_count = db.users.count_documents({"role": "admin"})
                current = db.users.find_one({"_id": ObjectId(uid)})
                if current and current.get("role") == "admin" and admin_count <= 1:
                    return jsonify({"error": "Cannot remove the last admin"}), 400
            update["role"] = d["role"]
        if d.get("password") and len(d["password"]) >= 4:
            update["password_hash"] = _hash_password(d["password"])
            update["must_change_password"] = True  # force user to change on next login

        db.users.update_one({"_id": ObjectId(uid)}, {"$set": update})
        user = db.users.find_one({"_id": ObjectId(uid)}, {"password_hash": 0})
        if not user:
            return jsonify({"error": "User not found"}), 404
        user["_id"] = str(user["_id"])
        return jsonify(user)

    @auth_bp.route("/users/<uid>", methods=["DELETE"])
    @jwt_required
    def delete_user(uid):
        if g.role != "admin":
            return jsonify({"error": "Admin access required"}), 403
        # Prevent self-delete
        if uid == g.user_id:
            return jsonify({"error": "Cannot delete your own account"}), 400
        # Prevent removing last admin
        user = db.users.find_one({"_id": ObjectId(uid)})
        if user and user.get("role") == "admin":
            admin_count = db.users.count_documents({"role": "admin"})
            if admin_count <= 1:
                return jsonify({"error": "Cannot delete the last admin"}), 400
        r = db.users.delete_one({"_id": ObjectId(uid)})
        if r.deleted_count == 0:
            return jsonify({"error": "User not found"}), 404
        return jsonify({"message": "Deleted"})

    return auth_bp