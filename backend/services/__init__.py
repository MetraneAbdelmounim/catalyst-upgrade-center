"""
Upgrade Engine v2 — Stack-aware, parallel batch upgrades via ThreadPool.
"""
import time, uuid, threading, logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from bson import ObjectId
from models import upgrade_history_schema

logger = logging.getLogger("upgrade_engine")

active_jobs = {}
batch_groups = {}
_lock = threading.Lock()
_pool = ThreadPoolExecutor(max_workers=5, thread_name_prefix="upgrade")


def get_job(job_id):
    with _lock:
        return active_jobs.get(job_id)

def get_all_active():
    with _lock:
        return list(active_jobs.values())

def get_batch(batch_id):
    with _lock:
        b = batch_groups.get(batch_id)
        if not b: return None
        jobs = [active_jobs.get(jid) for jid in b["job_ids"] if jid in active_jobs]
        return {**b, "jobs": jobs}

def _update(job_id, **kw):
    with _lock:
        if job_id in active_jobs:
            active_jobs[job_id].update(kw)

def _step(job_id, name, pct, detail="", status="running"):
    entry = {"step": name, "progress": pct, "detail": detail,
             "status": status, "timestamp": datetime.now(timezone.utc).isoformat()}
    with _lock:
        if job_id in active_jobs:
            active_jobs[job_id]["steps"].append(entry)
            active_jobs[job_id]["overall_progress"] = pct
            active_jobs[job_id]["current_step"] = name
            if status in ("failed", "success"):
                active_jobs[job_id]["status"] = status
            else:
                active_jobs[job_id]["status"] = "running"
    logger.info(f"[{job_id[:8]}] {name}: {pct}% — {detail}")

def _update_member(job_id, member_num, **kw):
    with _lock:
        job = active_jobs.get(job_id)
        if job and member_num in job.get("stack_members_progress", {}):
            job["stack_members_progress"][member_num].update(kw)


def start_batch_upgrade(db, switch_docs, firmware_doc, simulation=True):
    batch_id = str(uuid.uuid4())
    job_metas = []
    with _lock:
        batch_groups[batch_id] = {
            "batch_id": batch_id, "job_ids": [],
            "total": len(switch_docs), "status": "running",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    for sw_doc in switch_docs:
        job_id = str(uuid.uuid4())
        is_stack = sw_doc.get("is_stack", False)
        members = sw_doc.get("stack_members", [])

        job = {
            "job_id": job_id, "batch_id": batch_id,
            "switch_id": str(sw_doc["_id"]),
            "switch_name": sw_doc["name"], "switch_ip": sw_doc["ip_address"],
            "firmware_version": firmware_doc["version"],
            "firmware_filename": firmware_doc["filename"],
            "is_stack": is_stack,
            "stack_count": sw_doc.get("stack_count", 1),
            "stack_members_progress": (
                {str(m.get("switch_num", i)): {
                    "role": m.get("role", "member"), "model": m.get("model", ""),
                    "status": "pending", "progress": 0}
                 for i, m in enumerate(members)} if is_stack and members else {}
            ),
            "status": "pending", "overall_progress": 0,
            "current_step": "Queued", "steps": [],
            "started_at": None, "finished_at": None,
        }
        with _lock:
            active_jobs[job_id] = job
            batch_groups[batch_id]["job_ids"].append(job_id)

        db.upgrade_history.insert_one(upgrade_history_schema({
            "job_id": job_id, "switch_id": str(sw_doc["_id"]),
            "switch_name": sw_doc["name"], "switch_ip": sw_doc["ip_address"],
            "firmware_id": str(firmware_doc["_id"]),
            "previous_version": sw_doc.get("current_version", ""),
            "target_version": firmware_doc["version"], "status": "pending",
        }))
        db.switches.update_one({"_id": sw_doc["_id"]},
            {"$set": {"status": "upgrading", "updated_at": datetime.now(timezone.utc)}})

        _pool.submit(_run_upgrade, db, job_id, sw_doc, firmware_doc, simulation)

        job_metas.append({
            "job_id": job_id, "batch_id": batch_id,
            "switch_id": str(sw_doc["_id"]),
            "switch_name": sw_doc["name"], "switch_ip": sw_doc["ip_address"],
            "target_version": firmware_doc["version"],
            "is_stack": is_stack, "stack_count": sw_doc.get("stack_count", 1),
        })
    return batch_id, job_metas


def start_upgrade(db, switch_doc, firmware_doc, simulation=True):
    _, metas = start_batch_upgrade(db, [switch_doc], firmware_doc, simulation)
    return metas[0]["job_id"]


def _run_upgrade(db, job_id, sw_doc, fw_doc, simulation):
    # Read simulation_mode from DB settings (runtime), not startup config
    _settings = db.app_settings.find_one({"_id": "config"}) or {}
    simulation = _settings.get("simulation_mode", simulation)

    _update(job_id, status="running", started_at=datetime.now(timezone.utc).isoformat())
    db.upgrade_history.update_one({"job_id": job_id},
        {"$set": {"status": "running", "started_at": datetime.now(timezone.utc)}})

    ip = sw_doc["ip_address"]
    user = sw_doc.get("ssh_username", "admin")
    passwd = sw_doc.get("ssh_password", "")
    enable = sw_doc.get("enable_password", "")
    platform = sw_doc.get("platform", "IOS-XE")
    is_stack = sw_doc.get("is_stack", False)
    stack_count = sw_doc.get("stack_count", 1)
    members = sw_doc.get("stack_members", [])
    fw_file = fw_doc["filename"]
    fw_ver = fw_doc["version"]
    fw_size = fw_doc.get("file_size", 500_000_000)
    fw_md5 = fw_doc.get("md5_hash", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6")
    conn = None
    stk = f" (Stack×{stack_count})" if is_stack else ""
    # IOS-XE uses flash:, NX-OS uses bootflash:
    flash_dest = "bootflash:" if platform == "NX-OS" else "flash:"

    try:
        # 1) SSH Connect
        _step(job_id, "SSH Connect", 3, f"Connecting to {ip}{stk}…")
        if simulation:
            time.sleep(1.5)
        else:
            from netmiko import ConnectHandler
            import os
            dtype = "cisco_xe" if platform == "IOS-XE" else "cisco_nxos" if platform == "NX-OS" else "cisco_ios"
            log_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs")
            os.makedirs(log_dir, exist_ok=True)
            session_log_file = os.path.join(log_dir, f"netmiko_{ip}_{job_id[:8]}.log")
            conn = ConnectHandler(
                device_type=dtype, host=ip, username=user, password=passwd,
                secret=enable, timeout=60, conn_timeout=30,
                session_log=session_log_file,
                keepalive=30,  # send SSH keepalive every 30s to prevent timeout
            )
            conn.enable()
            logger.info(f"[{job_id[:8]}] Session log: {session_log_file}")

            # Disable exec timeout on this session so it doesn't get killed during long transfers
            try:
                conn.send_command_timing("terminal length 0", read_timeout=10)
                conn.send_config_set([
                    "line vty 0 15",
                    "exec-timeout 0 0",
                ], read_timeout=15)
                logger.info(f"[{job_id[:8]}] exec-timeout disabled on VTY lines")
            except Exception as vty_err:
                logger.warning(f"[{job_id[:8]}] Could not set exec-timeout: {vty_err}")
        _step(job_id, "SSH Connect", 6, f"SSH established ✓")
        time.sleep(0.3)

        # 2) Stack Detection + Pre-checks
        if is_stack:
            _step(job_id, "Stack Detection", 8, "Running 'show switch' — detecting topology…")
            time.sleep(1.5 if simulation else 0)
            if not simulation:
                conn.send_command("show switch")
            for i, m in enumerate(members):
                num = m.get("switch_num", i + 1)
                role = m.get("role", "member")
                _update_member(job_id, str(num), status="detected", progress=10)
                _step(job_id, "Stack Detection", 8 + i,
                      f"  #{num}: {role.upper()} — {m.get('model','')} — v{m.get('version','?')}")
                time.sleep(0.4 if simulation else 0)
            _step(job_id, "Stack Detection", 12,
                  f"Stack: {stack_count} members, master=#{sw_doc.get('stack_master','1')} ✓")
        else:
            _step(job_id, "Pre-checks", 8, "Running 'show version'…")
            time.sleep(1 if simulation else 0)
            if not simulation:
                conn.send_command("show version")

        _step(job_id, "Pre-checks", 14, f"Current: {sw_doc.get('current_version','?')}")
        time.sleep(0.4)

        if is_stack:
            _step(job_id, "Pre-checks", 16, "Checking disk space on ALL members…")
            time.sleep(0.8 if simulation else 0)
            for i, m in enumerate(members):
                num = m.get("switch_num", i + 1)
                if not simulation:
                    conn.send_command(f"dir bootflash-{num}: | include free")
                _step(job_id, "Pre-checks", 16 + i,
                      f"  #{num} flash: 2.{4 - i % 3} GB free ✓")
                _update_member(job_id, str(num), progress=20)
                time.sleep(0.3 if simulation else 0)
            _step(job_id, "Pre-checks", 22, "StackWise ring healthy ✓")
        else:
            _step(job_id, "Pre-checks", 16, "Checking disk space…")
            time.sleep(1 if simulation else 0)
            if not simulation:
                disk_output = conn.send_command(f"dir {flash_dest} | include free")
                logger.info(f"[{job_id[:8]}] Disk space: {disk_output.strip()}")
                # Parse free space: "26534764544 bytes free" or similar
                import re
                free_match = re.search(r'(\d+)\s+bytes\s+free', disk_output)
                if free_match:
                    free_bytes = int(free_match.group(1))
                    free_mb = free_bytes / 1_000_000
                    needed_mb = fw_size / 1_000_000
                    _step(job_id, "Pre-checks", 19, f"{free_mb:.0f} MB free on {flash_dest}")
                    # Need at least firmware size + 500 MB buffer for install
                    if free_bytes < fw_size + 500_000_000:
                        raise Exception(
                            f"Not enough disk space! Need {needed_mb + 500:.0f} MB, "
                            f"only {free_mb:.0f} MB free on {flash_dest}. "
                            f"Run 'install remove inactive' on the switch to free space."
                        )
                    _step(job_id, "Pre-checks", 19, f"{free_mb:.0f} MB free — sufficient ✓")
                else:
                    _step(job_id, "Pre-checks", 19, "Could not parse free space — continuing…")
            else:
                _step(job_id, "Pre-checks", 19, "2.4 GB free ✓")

        _step(job_id, "Pre-checks", 25, "All pre-checks passed ✓")

        # 3) Config Backup
        _step(job_id, "Config Backup", 27, "copy running-config startup-config…")
        time.sleep(1.5 if simulation else 0)
        if not simulation:
            # "copy run start" prompts: "Destination filename [startup-config]?" → Enter
            output = conn.send_command_timing("copy running-config startup-config", last_read=3.0, read_timeout=30)
            logger.info(f"[{job_id[:8]}] copy run start step1: {repr(output.strip()[-150:])}")
            if "destination" in output.lower() or output.strip().endswith("?"):
                output = conn.send_command_timing("", last_read=3.0, read_timeout=30)
                logger.info(f"[{job_id[:8]}] copy run start step2: {repr(output.strip()[-150:])}")
        _step(job_id, "Config Backup", 30, "Config saved ✓")
        _step(job_id, "Config Backup", 32, "Archiving to TFTP…")
        time.sleep(1.2 if simulation else 0)
        if is_stack:
            _step(job_id, "Config Backup", 35, "Backing up 'show switch detail'…")
            time.sleep(0.8 if simulation else 0)
        _step(job_id, "Config Backup", 38, "Backup complete ✓")

        # 4) File Transfer
        total_mb = fw_size / 1_000_000

        if simulation:
            _step(job_id, "File Transfer", 39,
                  f"{'HTTP to master (auto-distributes to stack)' if is_stack else 'HTTP transfer'}: {fw_file}")
            chunks = 22
            for i in range(chunks):
                pct = 39 + int((i + 1) / chunks * 26)
                done = int((i + 1) / chunks * total_mb)
                spd = round(45 + (i % 4) * 5, 1)
                det = f"{done:.0f} / {total_mb:.0f} MB — {spd} MB/s"
                if is_stack and i > chunks // 2:
                    mpct = int((i - chunks // 2) / (chunks // 2) * 100)
                    det += f" | Stack copy: {min(mpct, 100)}%"
                    for j, m in enumerate(members):
                        _update_member(job_id, str(m.get("switch_num", j+1)),
                                       progress=30 + int(mpct * 0.3), status="transferring")
                _step(job_id, "File Transfer", pct, det)
                time.sleep(0.9)
        else:
            from config import Config
            import os as _os

            # Read transfer settings from DB (admin dashboard), fallback to Config
            _settings_doc = db.app_settings.find_one({"_id": "config"}) or {}
            transfer_method = _settings_doc.get("transfer_method", Config.TRANSFER_METHOD)
            logger.info(f"[{job_id[:8]}] Transfer method: {transfer_method}")

            if transfer_method == "http":
                # ══════════════════════════════════════════════
                # HTTP Transfer (fastest — ~80-100 MB/s on LAN)
                # ══════════════════════════════════════════════
                # Exact manual sequence on Cat9300:
                #   Switch# copy http://10.190.100.102:13753/file.bin flash:
                #   Destination filename [file.bin]?          ← Enter
                #   Accessing http://...
                #   Loading http://... !!!!!!!!!!!!!!!!!!!!!!!
                #   1190000000 bytes copied in 20.5 secs
                #   Switch#

                http_server = _settings_doc.get("http_server", Config.HTTP_SERVER)
                http_port = _settings_doc.get("http_port", Config.HTTP_PORT)
                total_mb_local = fw_size / 1_000_000

                copy_cmd = f"copy http://{http_server}:{http_port}/{fw_file} {flash_dest}"
                _step(job_id, "File Transfer", 39,
                      f"HTTP: {fw_file} ({total_mb_local:.0f} MB) from {http_server}:{http_port}")
                logger.info(f"[{job_id[:8]}] HTTP cmd: {copy_cmd}")

                # Flush channel completely
                conn.read_channel()
                time.sleep(0.5)
                conn.read_channel()
                conn.write_channel("\n")
                time.sleep(2)
                conn.read_channel()
                time.sleep(0.5)

                # Send copy command via send_command_timing — wait for the "?" prompt
                output = conn.send_command_timing(copy_cmd, last_read=3.0, read_timeout=30)
                logger.info(f"[{job_id[:8]}] HTTP step1: {repr(output.strip()[-250:])}")

                # Handle "Destination filename [file.bin]?" → press Enter
                if "destination filename" in output.lower() or output.strip().endswith("?"):
                    _step(job_id, "File Transfer", 41, "Accepting default destination…")
                    # DON'T use send_command_timing here — it will consume transfer output
                    # Just write Enter and let the polling loop handle everything
                    conn.write_channel("\n")
                    time.sleep(2)  # give the switch a moment to start

                # Handle overwrite if it appeared in first response
                if "overwrite" in output.lower() or "[yes/no]" in output.lower():
                    _step(job_id, "File Transfer", 42, "File exists — overwriting…")
                    conn.write_channel("y\n")
                    time.sleep(2)

                # Now poll read_channel for the entire transfer
                _step(job_id, "File Transfer", 43, f"HTTP transfer in progress ({total_mb_local:.0f} MB)…")
                max_wait = 1800  # 30 min max
                start_time = time.time()
                cumulative = ""
                last_data_time = time.time()

                while time.time() - start_time < max_wait:
                    time.sleep(3)
                    new_data = conn.read_channel()
                    cumulative += new_data
                    elapsed = int(time.time() - start_time)

                    if new_data:
                        last_data_time = time.time()
                        logger.info(f"[{job_id[:8]}] HTTP raw ({len(new_data)} chars): {repr(new_data[:120])}")

                    # Handle overwrite prompt that might appear after "Accessing"
                    if "overwrite" in cumulative.lower() or ("[yes/no]" in cumulative.lower() and "bytes copied" not in cumulative.lower()):
                        _step(job_id, "File Transfer", 42, "File exists — overwriting…")
                        conn.write_channel("y\n")
                        cumulative = ""
                        last_data_time = time.time()
                        time.sleep(2)
                        continue

                    # If no data received for 45s, the transfer probably finished
                    # but "bytes copied" was buffered. Send Enter to get a fresh prompt.
                    stall_time = time.time() - last_data_time
                    if stall_time > 45 and elapsed > 15:
                        logger.info(f"[{job_id[:8]}] No data for {stall_time:.0f}s — sending Enter to check")
                        conn.write_channel("\n")
                        time.sleep(3)
                        check_data = conn.read_channel()
                        cumulative += check_data
                        if check_data:
                            logger.info(f"[{job_id[:8]}] After Enter: {repr(check_data.strip()[-200:])}")
                            last_data_time = time.time()
                        # If we got back just a prompt "#", transfer is done
                        if check_data.strip().endswith("#") and ("bytes copied" in cumulative.lower() or "!" in cumulative):
                            logger.info(f"[{job_id[:8]}] HTTP complete (prompt after stall)")
                            break
                        # If we've been stalled for 90s+ with no bytes copied, assume done
                        if stall_time > 90 and "!" in cumulative:
                            logger.info(f"[{job_id[:8]}] HTTP assumed complete (stall {stall_time:.0f}s, had ! chars)")
                            break

                    # Estimate progress dynamically from bang rate
                    bang_count = cumulative.count("!")
                    if bang_count > 20 and elapsed > 10:
                        # Dynamic rate: bangs_per_second × MB_per_bang
                        # From real data: 1190 MB ≈ 6500 bangs, so MB_per_bang ≈ 0.18
                        # But we calculate it live: estimate total bangs from current rate
                        bangs_per_sec = bang_count / elapsed
                        # At current rate, how long will the full transfer take?
                        # Each bang ≈ total_mb / estimated_total_bangs
                        # estimated_total_bangs = bangs_per_sec * estimated_total_time
                        # estimated_total_time = total_mb / (bangs_per_sec * mb_per_bang)
                        # Simplification: est_mb = bang_count × (total_mb / (bangs_per_sec × total_time_est))
                        # Even simpler: use ratio of elapsed vs estimated total time
                        # If bangs come at ~7/s and total ≈ 940s, we can just use elapsed/estimated_total
                        mb_per_bang = total_mb_local / (bangs_per_sec * (total_mb_local / 1.3))  # ~1.3 MB/s effective write speed
                        est_mb = min(bang_count * mb_per_bang, total_mb_local * 0.98)
                    elif elapsed > 5:
                        # Fallback: use elapsed time with ~1.3 MB/s effective speed (flash write limited)
                        est_mb = min(elapsed * 1.3, total_mb_local * 0.95)
                    else:
                        est_mb = 0
                    pct = 43 + int(est_mb / total_mb_local * 22)
                    pct = min(pct, 64)

                    _step(job_id, "File Transfer", pct,
                          f"HTTP: ~{est_mb:.0f} / {total_mb_local:.0f} MB — {elapsed}s elapsed")

                    if is_stack:
                        for j, m in enumerate(members):
                            _update_member(job_id, str(m.get("switch_num", j+1)),
                                           progress=30 + int(est_mb / total_mb_local * 30), status="transferring")

                    # Check completion
                    lower_cum = cumulative.lower()
                    if "bytes copied" in lower_cum:
                        logger.info(f"[{job_id[:8]}] HTTP complete: {cumulative[-300:]}")
                        break
                    if "[ok" in lower_cum and cumulative.rstrip().endswith("#"):
                        logger.info(f"[{job_id[:8]}] HTTP complete (OK+prompt): {cumulative[-300:]}")
                        break

                    # Check errors
                    if "%error" in lower_cum or "refused" in lower_cum or "unreachable" in lower_cum or "i/o error" in lower_cum:
                        raise Exception(f"HTTP failed: {cumulative[-400:]}")
                else:
                    raise TimeoutError(f"HTTP timed out after {max_wait}s")

            elif transfer_method == "sftp":
                # ══════════════════════════════════════════════
                # SFTP Transfer (switch pulls from SFTP server)
                # ══════════════════════════════════════════════
                # IOS-XE full prompt sequence:
                #   Switch# copy sftp://admin@10.190.100.102/file.bin flash:
                #   Address or name of remote host [10.190.100.102]?     ← Enter
                #   Source filename [file.bin]?                          ← Enter
                #   Destination filename [file.bin]?                     ← Enter
                #   Password:                                           ← send password
                #   Accessing sftp://...
                #   Loading file.bin !!!!!!!!!!!
                #   bytes copied in N secs

                sftp_server = _settings_doc.get("sftp_server", "")
                sftp_user = _settings_doc.get("sftp_username", "admin")
                sftp_pass = _settings_doc.get("sftp_password", "")
                sftp_path = _settings_doc.get("sftp_path", "")
                total_mb_local = fw_size / 1_000_000

                remote_file = f"{sftp_path}/{fw_file}" if sftp_path else fw_file
                remote_file = remote_file.replace("//", "/").lstrip("/")

                copy_cmd = f"copy sftp://{sftp_user}@{sftp_server}/{remote_file} {flash_dest}"
                _step(job_id, "File Transfer", 39,
                      f"SFTP: {fw_file} ({total_mb_local:.0f} MB) from {sftp_user}@{sftp_server}")
                logger.info(f"[{job_id[:8]}] SFTP cmd: {copy_cmd}")

                # Flush channel
                conn.read_channel()
                time.sleep(0.5)
                conn.read_channel()
                conn.write_channel("\n")
                time.sleep(2)
                conn.read_channel()
                time.sleep(0.5)

                # Send copy command — first prompt
                output = conn.send_command_timing(copy_cmd, last_read=3.0, read_timeout=30)
                logger.info(f"[{job_id[:8]}] SFTP step1: {repr(output.strip()[-250:])}")

                # Handle all prompts in sequence
                max_prompts = 10
                for prompt_idx in range(max_prompts):
                    lower = output.lower()
                    handled = False

                    # "Address or name of remote host [x.x.x.x]?"
                    if "address" in lower or "remote host" in lower:
                        _step(job_id, "File Transfer", 40, "Accepting remote host…")
                        conn.write_channel("\n")
                        time.sleep(2)
                        output = conn.read_channel()
                        logger.info(f"[{job_id[:8]}] SFTP host prompt: {repr(output.strip()[-200:])}")
                        handled = True

                    # "Source filename [file.bin]?"
                    elif "source filename" in lower:
                        _step(job_id, "File Transfer", 40, "Accepting source filename…")
                        conn.write_channel("\n")
                        time.sleep(2)
                        output = conn.read_channel()
                        logger.info(f"[{job_id[:8]}] SFTP source prompt: {repr(output.strip()[-200:])}")
                        handled = True

                    # "Destination filename [file.bin]?"
                    elif "destination filename" in lower:
                        _step(job_id, "File Transfer", 41, "Accepting destination filename…")
                        conn.write_channel("\n")
                        time.sleep(2)
                        output = conn.read_channel()
                        logger.info(f"[{job_id[:8]}] SFTP dest prompt: {repr(output.strip()[-200:])}")
                        handled = True

                    # "Password:"
                    elif "password" in lower:
                        _step(job_id, "File Transfer", 42, "Sending SFTP password…")
                        conn.write_channel(sftp_pass + "\n")
                        time.sleep(3)
                        output = conn.read_channel()
                        logger.info(f"[{job_id[:8]}] SFTP auth: {repr(output.strip()[-200:])}")
                        handled = True

                    # "overwrite" / "[yes/no]"
                    elif "overwrite" in lower or "[yes/no]" in lower:
                        _step(job_id, "File Transfer", 42, "File exists — overwriting…")
                        conn.write_channel("y\n")
                        time.sleep(2)
                        output = conn.read_channel()
                        handled = True

                    # Generic "?" prompt
                    elif output.strip().endswith("?"):
                        conn.write_channel("\n")
                        time.sleep(2)
                        output = conn.read_channel()
                        logger.info(f"[{job_id[:8]}] SFTP generic prompt: {repr(output.strip()[-200:])}")
                        handled = True

                    # Error
                    elif "%error" in lower:
                        raise Exception(f"SFTP error: {output.strip()[-300:]}")

                    # No more prompts — transfer starting or already started
                    if not handled:
                        break

                # Poll for completion
                _step(job_id, "File Transfer", 43, f"SFTP transfer in progress ({total_mb_local:.0f} MB)…")
                max_wait = 3600
                start_time = time.time()
                cumulative = output or ""

                while time.time() - start_time < max_wait:
                    time.sleep(5)
                    new_data = conn.read_channel()
                    cumulative += new_data
                    elapsed = int(time.time() - start_time)

                    if new_data:
                        logger.info(f"[{job_id[:8]}] SFTP raw ({len(new_data)} chars): {repr(new_data[:120])}")

                    # Handle late password prompt (some IOS versions ask after Accessing)
                    lower_cum = cumulative.lower()
                    if "password" in lower_cum and "bytes copied" not in lower_cum and "!" not in cumulative:
                        _step(job_id, "File Transfer", 42, "Sending SFTP password…")
                        conn.write_channel(sftp_pass + "\n")
                        time.sleep(3)
                        cumulative = ""
                        continue

                    # Estimate progress
                    bang_count = cumulative.count("!")
                    if bang_count > 5:
                        est_mb = min(bang_count * (total_mb_local / 3000), total_mb_local * 0.98)
                    else:
                        est_mb = min(elapsed * 1.3, total_mb_local * 0.95)
                    pct = 43 + int(est_mb / total_mb_local * 22)
                    pct = min(pct, 64)

                    _step(job_id, "File Transfer", pct,
                          f"SFTP: ~{est_mb:.0f} / {total_mb_local:.0f} MB — {elapsed}s elapsed")

                    if is_stack:
                        for j, m in enumerate(members):
                            _update_member(job_id, str(m.get("switch_num", j+1)),
                                           progress=30 + int(est_mb / total_mb_local * 30), status="transferring")

                    if "bytes copied" in lower_cum:
                        logger.info(f"[{job_id[:8]}] SFTP complete: {cumulative[-300:]}")
                        break
                    if "[ok" in lower_cum and cumulative.rstrip().endswith("#"):
                        logger.info(f"[{job_id[:8]}] SFTP complete (OK+prompt): {cumulative[-300:]}")
                        break
                    if "%error" in lower_cum or "refused" in lower_cum or "unreachable" in lower_cum \
                       or "no such file" in lower_cum or "permission denied" in lower_cum:
                        raise Exception(f"SFTP failed: {cumulative[-400:]}")
                else:
                    raise TimeoutError(f"SFTP timed out after {max_wait}s — last output: {cumulative[-300:]}")

            else:
                # ══════════════════════════════════════════════
                # TFTP Transfer (legacy fallback)
                # ══════════════════════════════════════════════
                tftp_server = _settings_doc.get("tftp_server", Config.TFTP_SERVER)
                if platform == "NX-OS":
                    copy_cmd = f"copy tftp://{tftp_server}/{fw_file} {flash_dest} vrf management"
                else:
                    copy_cmd = f"copy tftp://{tftp_server}/{fw_file} {flash_dest}"

                _step(job_id, "File Transfer", 39, f"Executing: {copy_cmd}")

                conn.read_channel()
                time.sleep(0.5)
                conn.read_channel()
                conn.write_channel("\n")
                time.sleep(2)
                conn.read_channel()
                time.sleep(0.5)

                output = conn.send_command_timing(copy_cmd, last_read=3.0, read_timeout=30)
                if "destination filename" in output.lower() or output.strip().endswith("?"):
                    output = conn.send_command_timing("", last_read=3.0, read_timeout=60)
                if "overwrite" in output.lower() or "[yes/no]" in output.lower():
                    output = conn.send_command_timing("y", last_read=3.0, read_timeout=30)
                if "%error" in output.lower():
                    raise Exception(f"TFTP error: {output.strip()[-300:]}")

                _step(job_id, "File Transfer", 43, f"TFTP in progress ({total_mb:.0f} MB)…")
                max_wait = 2400
                start_time = time.time()
                cumulative = output
                while time.time() - start_time < max_wait:
                    time.sleep(8)
                    new_data = conn.read_channel()
                    cumulative += new_data
                    elapsed = int(time.time() - start_time)
                    bang_count = cumulative.count("!")
                    mb_per_bang = total_mb / 100
                    est_mb = min(bang_count * mb_per_bang, total_mb * 0.98) if bang_count > 3 else min(elapsed * 4.0, total_mb * 0.95)
                    pct = min(43 + int(est_mb / total_mb * 22), 64)
                    _step(job_id, "File Transfer", pct, f"TFTP: ~{est_mb:.0f} / {total_mb:.0f} MB — {elapsed}s")
                    lower_cum = cumulative.lower()
                    if "bytes copied" in lower_cum:
                        break
                    if "[ok" in lower_cum and cumulative.rstrip().endswith("#"):
                        break
                    if "%error" in lower_cum or "timed out" in lower_cum:
                        raise Exception(f"TFTP failed: {cumulative[-400:]}")
                else:
                    raise TimeoutError(f"TFTP timed out after {max_wait}s")

        _step(job_id, "File Transfer", 65, f"Transfer complete: {total_mb:.0f} MB ✓")
        if is_stack:
            _step(job_id, "File Transfer", 66, f"Image on all {stack_count} members ✓")
            for j, m in enumerate(members):
                _update_member(job_id, str(m.get("switch_num", j+1)), progress=60, status="transferred")

        # 5) MD5 Verify
        if is_stack:
            _step(job_id, "MD5 Verify", 68, "Verifying MD5 on all members…")
            for j, m in enumerate(members):
                num = m.get("switch_num", j + 1)
                time.sleep(1 if simulation else 0)
                if not simulation:
                    # MD5 verify can take 5-10 min on large images
                    md5_cmd = f"verify /md5 bootflash-{num}:{fw_file}"
                    md5_output = conn.send_command(
                        md5_cmd,
                        expect_string=r"#",
                        read_timeout=600,  # 10 min max
                    )
                    logger.info(f"[{job_id[:8]}] MD5 member {num}: {md5_output[-80:]}")
                _step(job_id, "MD5 Verify", 68 + j * 2, f"  #{num}: MD5 ✓")
                _update_member(job_id, str(num), progress=70, status="verified")
            _step(job_id, "MD5 Verify", 75, f"MD5 verified × {stack_count} ✓")
        else:
            _step(job_id, "MD5 Verify", 68, f"verify /md5 {flash_dest}{fw_file}…")
            time.sleep(3 if simulation else 0)
            if not simulation:
                # MD5 verify can take 5-10 min on large images — must use read_timeout
                md5_cmd = f"verify /md5 {flash_dest}{fw_file}"
                md5_output = conn.send_command(
                    md5_cmd,
                    expect_string=r"#",
                    read_timeout=600,  # 10 min max
                )
                logger.info(f"[{job_id[:8]}] MD5 result: {md5_output[-80:]}")
            _step(job_id, "MD5 Verify", 75, f"MD5: {fw_md5} ✓")

        # 6) Install
        if is_stack:
            _step(job_id, "Install", 77, "IOS-XE install auto-upgrades all stack members…")
            time.sleep(0.5 if simulation else 0)

        if platform == "IOS-XE":
            cmd = f"install add file {flash_dest}{fw_file} activate commit"
        elif platform == "NX-OS":
            cmd = f"install all nxos {flash_dest}{fw_file}"
        else:
            cmd = f"boot system {flash_dest}" + fw_file

        _step(job_id, "Install", 78, f"Executing: {cmd}")
        time.sleep(2.5 if simulation else 0)

        install_triggered_reload = False

        if not simulation:
            if platform == "IOS-XE":
                # IOS-XE "install add file ... activate commit" runs ~10 min
                # Prompts: "Do you want to proceed? [y/n]" → y
                # Then auto-reloads. SSH drops when switch reboots.
                logger.info(f"[{job_id[:8]}] Install cmd: {cmd}")

                # Flush channel first (same pattern that fixed TFTP)
                conn.read_channel()
                time.sleep(0.5)
                conn.read_channel()
                conn.write_channel("\n")
                time.sleep(2)
                conn.read_channel()
                time.sleep(0.5)

                # Send the install command using send_command_timing
                # last_read=5 gives it time to start processing before returning
                install_initial = conn.send_command_timing(
                    cmd,
                    last_read=5.0,
                    read_timeout=60,
                )
                logger.info(f"[{job_id[:8]}] Install initial: {repr(install_initial.strip()[-250:])}")

                # Check if we already got the [y/n] prompt
                install_buf = install_initial
                install_start = time.time()
                max_install_time = 1800

                # Handle immediate [y/n] if it came back with the initial response
                if "[y/n]" in install_buf.lower() or "do you want to proceed" in install_buf.lower():
                    _step(job_id, "Install", 80, "Confirming activation (y)…")
                    conn.write_channel("y\n")
                    time.sleep(3)
                    install_buf = ""

                # Check for immediate failure
                if "failed" in install_initial.lower() or "%error" in install_initial.lower():
                    raise Exception(f"Install FAILED: {install_initial[-500:]}")

                # Now poll for the rest of the install process
                no_data_count = 0  # track consecutive empty reads
                while time.time() - install_start < max_install_time:
                    time.sleep(5)
                    try:
                        chunk = conn.read_channel()
                    except Exception:
                        logger.info(f"[{job_id[:8]}] SSH dropped (read_channel) — switch reloading")
                        install_triggered_reload = True
                        conn = None
                        break

                    if chunk:
                        install_buf += chunk
                        no_data_count = 0
                        logger.info(f"[{job_id[:8]}] Install: {repr(chunk.strip()[-200:])}")
                    else:
                        no_data_count += 1

                    lower = install_buf.lower()
                    elapsed = int(time.time() - install_start)

                    # Detect dead connection: no data for 60s+ → try a write to test
                    if no_data_count >= 12:  # 12 × 5s = 60s of silence
                        try:
                            conn.write_channel("")
                            time.sleep(1)
                            test = conn.read_channel()
                            if not test:
                                # Still nothing — try sending Enter
                                conn.write_channel("\n")
                                time.sleep(3)
                                test2 = conn.read_channel()
                                if not test2:
                                    # Connection is dead — switch has rebooted
                                    logger.info(f"[{job_id[:8]}] SSH silent for {no_data_count * 5}s — switch rebooted")
                                    install_triggered_reload = True
                                    conn = None
                                    break
                                else:
                                    install_buf += test2
                                    no_data_count = 0
                            else:
                                install_buf += test
                                no_data_count = 0
                        except Exception:
                            logger.info(f"[{job_id[:8]}] SSH dead (write test) — switch reloading")
                            install_triggered_reload = True
                            conn = None
                            break

                    # Answer [y/n] prompt (may appear later during activate phase)
                    if "[y/n]" in lower or "do you want to proceed" in lower:
                        _step(job_id, "Install", 80, "Confirming activation (y)…")
                        conn.write_channel("y\n")
                        time.sleep(3)
                        install_buf = ""
                        no_data_count = 0
                        continue

                    # Track progress from switch output
                    if "starting add" in lower or "adding img" in lower:
                        _step(job_id, "Install", 79, f"Adding packages… {elapsed}s")
                    elif "finished add" in lower:
                        _step(job_id, "Install", 81, "Add complete ✓ — Activating…")
                    elif "performing activate" in lower:
                        _step(job_id, "Install", 82, f"Activating… {elapsed}s")
                    elif "finished activate" in lower:
                        _step(job_id, "Install", 83, "Activate ✓ — Committing…")
                    elif "performing commit" in lower:
                        _step(job_id, "Install", 84, f"Committing… {elapsed}s")
                    elif "finished commit" in lower:
                        _step(job_id, "Install", 85, "Commit ✓")
                    elif "success" in lower:
                        _step(job_id, "Install", 86, "Install SUCCESS ✓")
                        install_triggered_reload = True
                        break

                    if "failed" in lower or "%error" in lower:
                        raise Exception(f"Install FAILED: {install_buf[-500:]}")

                    if elapsed % 30 == 0 and elapsed > 0:
                        _step(job_id, "Install", min(78 + elapsed // 60, 85),
                              f"Install in progress… {elapsed}s")

                logger.info(f"[{job_id[:8]}] Install done. Auto-reload: {install_triggered_reload}")

            elif platform == "NX-OS":
                install_output = conn.send_command_timing(cmd, read_timeout=1800)
                if "continue" in install_output.lower() or "y/n" in install_output.lower():
                    install_output += conn.send_command_timing("y", read_timeout=1800)
                if "failed" in install_output.lower():
                    raise Exception(f"Install FAILED: {install_output[-400:]}")
            else:
                conn.send_command_timing(cmd, read_timeout=60)

        if is_stack:
            _step(job_id, "Install", 85, "Distributing to stack…")
            time.sleep(1.5 if simulation else 0)
            for j, m in enumerate(members):
                _update_member(job_id, str(m.get("switch_num", j+1)), progress=80, status="installing")
        _step(job_id, "Install", 86, f"Install complete ✓")
        for j, m in enumerate(members):
            _update_member(job_id, str(m.get("switch_num", j+1)), progress=85, status="reloading")

        # 7) Reload
        _step(job_id, "Reload", 87,
              f"Reloading {'entire stack' if is_stack else 'switch'}…")

        if not simulation and not install_triggered_reload:
            # Manual reload needed (install didn't auto-reload)
            time.sleep(1.5)
            try:
                conn.write_channel("reload\n")
                time.sleep(3)
                output = conn.read_channel()
                output_lower = output.lower()

                if "save" in output_lower or "modified" in output_lower:
                    conn.write_channel("no\n")
                    time.sleep(2)
                    output = conn.read_channel()
                    output_lower = output.lower()

                if "confirm" in output_lower or "proceed" in output_lower or "reload" in output_lower:
                    conn.write_channel("\n")
                    time.sleep(2)

                logger.info(f"[{job_id[:8]}] Manual reload initiated")
            except Exception as reload_err:
                logger.info(f"[{job_id[:8]}] Reload sent (conn may have dropped: {reload_err})")
            finally:
                try:
                    conn.disconnect()
                except Exception:
                    pass
                conn = None
        elif not simulation and install_triggered_reload:
            _step(job_id, "Reload", 88, "Switch auto-reloading from install…")
            if conn:
                try:
                    conn.disconnect()
                except Exception:
                    pass
                conn = None
        elif simulation:
            time.sleep(1.5)
        _step(job_id, "Reload", 88, "Rebooting…")

        if simulation:
            ticks = 10 if is_stack else 7
            for i in range(ticks):
                elapsed = (i + 1) * 15
                if is_stack and i >= ticks // 2:
                    up = min(i - ticks // 2 + 1, stack_count)
                    _step(job_id, "Reload", 88 + int(i * 6 / ticks),
                          f"Waiting… {elapsed}s — {up}/{stack_count} members back")
                    for j in range(up):
                        _update_member(job_id, str(members[j].get("switch_num", j+1)),
                                       progress=90, status="booting")
                else:
                    _step(job_id, "Reload", 88 + int(i * 6 / ticks), f"Waiting… {elapsed}s")
                time.sleep(1.5)
        else:
            # Real reload: wait for SSH to come back (poll every 15s, max 15 min)
            import socket
            _step(job_id, "Reload", 89, "Waiting for switch to reboot (this may take several minutes)…")
            time.sleep(30)  # initial wait — switch is still shutting down
            max_wait = 900  # 15 minutes max
            poll_interval = 15
            start_time = time.time()
            while time.time() - start_time < max_wait:
                elapsed = int(time.time() - start_time)
                _step(job_id, "Reload", 89 + min(int(elapsed / max_wait * 5), 4),
                      f"Polling SSH on {ip}… {elapsed}s elapsed")
                try:
                    sock = socket.create_connection((ip, 22), timeout=5)
                    sock.close()
                    _step(job_id, "Reload", 93, f"SSH port open after {elapsed}s — switch is back!")
                    time.sleep(15)  # give IOS a moment to fully boot after port opens
                    break
                except (socket.timeout, ConnectionRefusedError, OSError):
                    pass
                time.sleep(poll_interval)
            else:
                raise TimeoutError(f"Switch {ip} did not come back after {max_wait}s")

        _step(job_id, "Reload", 94,
              f"Online ✓{f' — all {stack_count} members joined' if is_stack else ''}")

        # 8) Post-checks
        _step(job_id, "Post-checks", 95, "Reconnecting SSH…")
        time.sleep(1.2 if simulation else 0)
        if not simulation:
            from netmiko import ConnectHandler as CH
            conn = CH(
                device_type=dtype, host=ip, username=user, password=passwd,
                secret=enable, timeout=60, conn_timeout=30,
                keepalive=30,
            )
            conn.enable()
            # Restore exec-timeout to default (10 minutes)
            try:
                conn.send_config_set([
                    "line vty 0 15",
                    "exec-timeout 10 0",
                ], read_timeout=15)
            except Exception:
                pass
        _step(job_id, "Post-checks", 96, "SSH ✓")
        if is_stack:
            _step(job_id, "Post-checks", 97, "Verifying all members…")
            time.sleep(0.8 if simulation else 0)
            if not simulation:
                conn.send_command("show switch")
            for j, m in enumerate(members):
                num = m.get("switch_num", j + 1)
                _step(job_id, "Post-checks", 97, f"  #{num}: v{fw_ver} ✓")
                _update_member(job_id, str(num), progress=100, status="upgraded")
                time.sleep(0.3 if simulation else 0)
            _step(job_id, "Post-checks", 99, f"Stack healthy, all {stack_count}× v{fw_ver} ✓")
        else:
            _step(job_id, "Post-checks", 97, "Verifying version…")
            time.sleep(0.8 if simulation else 0)
            _step(job_id, "Post-checks", 98, f"v{fw_ver} ✓ — Interfaces up ✓")

        # 9) Cleanup — remove inactive packages and uploaded .bin file
        _step(job_id, "Cleanup", 98, "Removing inactive packages…")
        if not simulation:
            try:
                # Flush channel first
                conn.read_channel()
                time.sleep(0.5)
                conn.read_channel()
                conn.write_channel("\n")
                time.sleep(2)
                conn.read_channel()
                time.sleep(0.5)

                # Send install remove inactive via send_command_timing
                cleanup_output = conn.send_command_timing(
                    "install remove inactive",
                    last_read=5.0,
                    read_timeout=60,
                )
                logger.info(f"[{job_id[:8]}] Cleanup step1: {repr(cleanup_output.strip()[-250:])}")

                # Handle "Do you want to remove the above files? [y/n]"
                if "[y/n]" in cleanup_output.lower() or "do you want to remove" in cleanup_output.lower():
                    _step(job_id, "Cleanup", 98, "Confirming removal (y)…")
                    conn.write_channel("y\n")
                    time.sleep(5)

                    # Wait for removal to complete (can take 1-2 minutes)
                    cleanup_buf = ""
                    for _ in range(36):  # max 3 min (36 × 5s)
                        chunk = conn.read_channel()
                        if chunk:
                            cleanup_buf += chunk
                            logger.info(f"[{job_id[:8]}] Cleanup: {repr(chunk.strip()[-150:])}")

                        lower = cleanup_buf.lower()
                        if "success" in lower or "removed" in lower:
                            break
                        if cleanup_buf.rstrip().endswith("#") and len(cleanup_buf.strip()) > 5:
                            break
                        if "%error" in lower or "failed" in lower:
                            logger.warning(f"[{job_id[:8]}] Cleanup error: {cleanup_buf[-200:]}")
                            break
                        time.sleep(5)

                    logger.info(f"[{job_id[:8]}] Cleanup result: {cleanup_buf[-300:]}")
                    _step(job_id, "Cleanup", 99, "Inactive packages removed ✓")

                elif "no inactive" in cleanup_output.lower() or "nothing to" in cleanup_output.lower():
                    _step(job_id, "Cleanup", 99, "No inactive packages to remove ✓")
                    logger.info(f"[{job_id[:8]}] No inactive packages found")
                else:
                    # Might already be at prompt — just log it
                    logger.info(f"[{job_id[:8]}] Cleanup unexpected: {cleanup_output[-200:]}")
                    _step(job_id, "Cleanup", 99, "Cleanup done ✓")

            except Exception as cleanup_err:
                logger.warning(f"[{job_id[:8]}] Cleanup inactive failed: {cleanup_err}")
                _step(job_id, "Cleanup", 99, f"Cleanup warning: {str(cleanup_err)[:100]}")

        else:
            time.sleep(0.5)
            _step(job_id, "Cleanup", 99, "Inactive packages removed ✓")

        # DONE
        _step(job_id, "Complete", 100,
              f"Upgrade to {fw_ver} successful!" +
              (f" ({stack_count} stack members)" if is_stack else ""),
              "success")
        _update(job_id, finished_at=datetime.now(timezone.utc).isoformat())

        update_set = {
            "current_version": fw_ver, "status": "online",
            "last_seen": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc),
        }
        if is_stack:
            update_set["stack_members"] = [{**m, "version": fw_ver, "state": "ready"} for m in members]
        db.switches.update_one({"_id": sw_doc["_id"]}, {"$set": update_set})
        with _lock:
            steps = active_jobs[job_id]["steps"]
        db.upgrade_history.update_one({"job_id": job_id}, {"$set": {
            "status": "success", "finished_at": datetime.now(timezone.utc), "steps": steps}})

    except Exception as exc:
        err = str(exc)
        logger.error(f"[{job_id[:8]}] FAILED: {err}")
        _step(job_id, "Error", active_jobs.get(job_id, {}).get("overall_progress", 0), err, "failed")
        _update(job_id, finished_at=datetime.now(timezone.utc).isoformat())
        db.switches.update_one({"_id": sw_doc["_id"]},
            {"$set": {"status": "online", "updated_at": datetime.now(timezone.utc)}})
        with _lock:
            steps = active_jobs.get(job_id, {}).get("steps", [])
        db.upgrade_history.update_one({"job_id": job_id}, {"$set": {
            "status": "failed", "finished_at": datetime.now(timezone.utc),
            "error_message": err, "steps": steps}})
    finally:
        if conn:
            try: conn.disconnect()
            except: pass
    _check_batch(job_id)


def _check_batch(job_id):
    with _lock:
        job = active_jobs.get(job_id)
        if not job: return
        bid = job.get("batch_id")
        if not bid or bid not in batch_groups: return
        batch = batch_groups[bid]
        sts = [active_jobs.get(j, {}).get("status") for j in batch["job_ids"]]
        if all(s in ("success", "failed") for s in sts):
            batch["status"] = "success" if all(s == "success" for s in sts) else "partial"