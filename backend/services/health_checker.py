"""
Switch Health Checker
=====================
- Pings switches to detect online/offline status
- Runs as a background daemon thread on a configurable interval
- Also exposes functions for on-demand checking (single or all)
"""
import subprocess
import platform
import threading
import time
import logging
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger("health_checker")

_checker_thread = None
_stop_event = threading.Event()


def ping_host(ip: str, timeout: int = 2) -> bool:
    """
    Ping a host. Returns True if reachable, False otherwise.
    Works on both Windows and Linux/Mac.
    """
    try:
        # -n (Windows) or -c (Linux/Mac) for count, -w/-W for timeout
        is_windows = platform.system().lower() == "windows"
        if is_windows:
            cmd = ["ping", "-w", str(timeout * 1000), ip]
        else:
            cmd = ["ping", "-W", str(timeout), ip]

        result = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=timeout + 3
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, Exception):
        return False


def check_switch(db, switch_doc, ping_timeout: int = 2) -> dict:
    """
    Check a single switch's reachability and update its status in MongoDB.
    Skips switches that are currently upgrading.
    Returns { ip, name, old_status, new_status, reachable }
    """
    ip = switch_doc["ip_address"]
    name = switch_doc.get("name", ip)
    old_status = switch_doc.get("status", "unknown")

    # Don't touch switches mid-upgrade
    if old_status == "upgrading":
        return {"ip": ip, "name": name, "old_status": old_status,
                "new_status": old_status, "reachable": None, "skipped": True}

    reachable = ping_host(ip, timeout=ping_timeout)
    new_status = "online" if reachable else "offline"

    # Update MongoDB only if status actually changed
    update_fields = {"updated_at": datetime.now(timezone.utc)}
    if new_status != old_status:
        update_fields["status"] = new_status
        logger.info(f"[{name}] {ip}: {old_status} → {new_status}")

    if reachable:
        update_fields["last_seen"] = datetime.now(timezone.utc)

    db.switches.update_one(
        {"_id": switch_doc["_id"]},
        {"$set": update_fields}
    )

    return {"ip": ip, "name": name, "old_status": old_status,
            "new_status": new_status, "reachable": reachable, "skipped": False}


def check_all_switches(db, ping_timeout: int = 2, max_workers: int = 10) -> list:
    """
    Check all switches in parallel. Returns list of results.
    Uses a thread pool to ping multiple switches simultaneously.
    """
    switches = list(db.switches.find({}))
    if not switches:
        return []

    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {
            pool.submit(check_switch, db, sw, ping_timeout): sw
            for sw in switches
        }
        for future in as_completed(futures):
            try:
                results.append(future.result())
            except Exception as e:
                sw = futures[future]
                logger.error(f"Health check failed for {sw.get('ip_address')}: {e}")
                results.append({
                    "ip": sw.get("ip_address"), "name": sw.get("name"),
                    "old_status": sw.get("status"), "new_status": sw.get("status"),
                    "reachable": None, "skipped": False, "error": str(e)
                })

    online = sum(1 for r in results if r.get("new_status") == "online")
    offline = sum(1 for r in results if r.get("new_status") == "offline")
    changed = sum(1 for r in results if r.get("old_status") != r.get("new_status") and not r.get("skipped"))
    logger.info(f"Health check complete: {len(results)} switches — {online} online, {offline} offline, {changed} changed")

    return results


def start_background_checker(db, interval: int = 60, ping_timeout: int = 2):
    """
    Start a background daemon thread that checks all switches every `interval` seconds.
    Call this once at app startup.
    """
    global _checker_thread

    if interval <= 0:
        logger.info("Background health checker disabled (interval=0)")
        return

    if _checker_thread and _checker_thread.is_alive():
        logger.warning("Background checker already running")
        return

    _stop_event.clear()

    def _loop():
        logger.info(f"Background health checker started (every {interval}s)")
        while not _stop_event.is_set():
            try:
                check_all_switches(db, ping_timeout=ping_timeout)
            except Exception as e:
                logger.error(f"Background health check error: {e}")
            _stop_event.wait(timeout=interval)
        logger.info("Background health checker stopped")

    _checker_thread = threading.Thread(target=_loop, daemon=True, name="health-checker")
    _checker_thread.start()


def stop_background_checker():
    """Stop the background checker thread."""
    _stop_event.set()
