from datetime import datetime, timezone


def switch_schema(data: dict) -> dict:
    return {
        "name": data.get("name", ""),
        "ip_address": data.get("ip_address", ""),
        "model": data.get("model", ""),
        "platform": data.get("platform", "IOS-XE"),
        "current_version": data.get("current_version", ""),
        "serial_number": data.get("serial_number", ""),
        "site": data.get("site", ""),
        "ssh_username": data.get("ssh_username", "admin"),
        "ssh_password": data.get("ssh_password", ""),
        "enable_password": data.get("enable_password", ""),
        "status": data.get("status", "unknown"),
        "last_seen": data.get("last_seen"),
        "created_at": data.get("created_at", datetime.now(timezone.utc)),
        "updated_at": datetime.now(timezone.utc),
        "notes": data.get("notes", ""),
        # ── Stack Support ──
        "is_stack": data.get("is_stack", False),
        "stack_count": data.get("stack_count", 1),       # number of members
        "stack_master": data.get("stack_master", ""),     # serial of active master
        "stack_members": data.get("stack_members", []),   # list of {switch_num, role, model, serial, version, state}
    }


def firmware_schema(data: dict) -> dict:
    return {
        "platform": data.get("platform", "IOS-XE"),
        "model_family": data.get("model_family", ""),
        "version": data.get("version", ""),
        "filename": data.get("filename", ""),
        "file_size": data.get("file_size", 0),
        "md5_hash": data.get("md5_hash", ""),
        "release_date": data.get("release_date"),
        "is_recommended": data.get("is_recommended", False),
        "release_notes": data.get("release_notes", ""),
        "created_at": datetime.now(timezone.utc),
    }


def upgrade_history_schema(data: dict) -> dict:
    return {
        "job_id": data.get("job_id", ""),
        "switch_id": data.get("switch_id", ""),
        "switch_name": data.get("switch_name", ""),
        "switch_ip": data.get("switch_ip", ""),
        "firmware_id": data.get("firmware_id", ""),
        "previous_version": data.get("previous_version", ""),
        "target_version": data.get("target_version", ""),
        "status": data.get("status", "pending"),
        "started_at": data.get("started_at"),
        "finished_at": data.get("finished_at"),
        "steps": data.get("steps", []),
        "error_message": data.get("error_message", ""),
        "created_at": datetime.now(timezone.utc),
    }


def user_schema(data: dict) -> dict:
    return {
        "username": data.get("username", ""),
        "password_hash": data.get("password_hash", ""),
        "full_name": data.get("full_name", ""),
        "role": data.get("role", "operator"),  # admin, operator
        "must_change_password": data.get("must_change_password", False),
        "created_at": datetime.now(timezone.utc),
    }