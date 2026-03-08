from datetime import datetime, timezone
from models import switch_schema, firmware_schema

def seed(db):
    if db.firmware.count_documents({}) == 0:
        entries = [
            firmware_schema({"platform":"IOS-XE","model_family":"Catalyst 9300","version":"17.12.04",
                "filename":"cat9k_iosxe.17.12.04.SPA.bin","file_size":510000000,
                "md5_hash":"a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
                "release_date":datetime(2025,3,1,tzinfo=timezone.utc),"is_recommended":True,
                "release_notes":"Security patches, SD-Access improvements, DNAC 2.3.7 support."}),
            firmware_schema({"platform":"IOS-XE","model_family":"Catalyst 9300","version":"17.12.03",
                "filename":"cat9k_iosxe.17.12.03.SPA.bin","file_size":505000000,
                "md5_hash":"b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5",
                "release_date":datetime(2024,11,15,tzinfo=timezone.utc),"is_recommended":False,
                "release_notes":"Bug fixes for OSPF and STP."}),
            firmware_schema({"platform":"IOS-XE","model_family":"Catalyst 9300","version":"17.09.05",
                "filename":"cat9k_iosxe.17.09.05.SPA.bin","file_size":490000000,
                "md5_hash":"c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6",
                "release_date":datetime(2024,5,10,tzinfo=timezone.utc),"is_recommended":False}),
            firmware_schema({"platform":"IOS-XE","model_family":"Catalyst 9200","version":"17.12.04",
                "filename":"cat9k_lite_iosxe.17.12.04.SPA.bin","file_size":412000000,
                "md5_hash":"d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1",
                "release_date":datetime(2025,3,1,tzinfo=timezone.utc),"is_recommended":True,
                "release_notes":"Recommended release for Catalyst 9200 series."}),
            firmware_schema({"platform":"IOS-XE","model_family":"Catalyst 9200","version":"17.12.03",
                "filename":"cat9k_lite_iosxe.17.12.03.SPA.bin","file_size":408000000,
                "md5_hash":"e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
                "release_date":datetime(2024,11,15,tzinfo=timezone.utc),"is_recommended":False}),
            firmware_schema({"platform":"IOS-XE","model_family":"Catalyst 3850","version":"16.12.12",
                "filename":"cat3k_caa-universalk9.16.12.12.SPA.bin","file_size":356000000,
                "md5_hash":"f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
                "release_date":datetime(2024,12,1,tzinfo=timezone.utc),"is_recommended":True,
                "release_notes":"Final recommended for Catalyst 3850."}),
            firmware_schema({"platform":"NX-OS","model_family":"Nexus 9300","version":"10.4(3)",
                "filename":"nxos64-cs.10.4.3.M.bin","file_size":1800000000,
                "md5_hash":"a1a2a3a4a5a6a7a8a9a0b1b2b3b4b5b6",
                "release_date":datetime(2025,2,15,tzinfo=timezone.utc),"is_recommended":True,
                "release_notes":"VXLAN EVPN enhancements."}),
            firmware_schema({"platform":"NX-OS","model_family":"Nexus 9300","version":"10.4(2)",
                "filename":"nxos64-cs.10.4.2.M.bin","file_size":1700000000,
                "md5_hash":"b1b2b3b4b5b6b7b8b9b0c1c2c3c4c5c6",
                "release_date":datetime(2024,10,20,tzinfo=timezone.utc),"is_recommended":False}),
            firmware_schema({"platform":"NX-OS","model_family":"Nexus 9500","version":"10.4(3)",
                "filename":"nxos64-cs.10.4.3.M.bin","file_size":2100000000,
                "md5_hash":"c1c2c3c4c5c6c7c8c9c0d1d2d3d4d5d6",
                "release_date":datetime(2025,2,15,tzinfo=timezone.utc),"is_recommended":True}),
        ]
        db.firmware.insert_many(entries)
        print(f"  ✓ Seeded {len(entries)} firmware")

    if db.switches.count_documents({}) == 0:
        sws = [
            switch_schema({"name":"CORE-SW-01","ip_address":"10.0.1.1","model":"C9300-48P",
                "platform":"IOS-XE","current_version":"17.09.05","serial_number":"FCW2345A001",
                "site":"HQ-DataCenter","ssh_username":"admin","ssh_password":"cisco123",
                "enable_password":"enable123","status":"online","last_seen":datetime.now(timezone.utc),
                "is_stack": True, "stack_count": 4, "stack_master": "FCW2345A001",
                "stack_members": [
                    {"switch_num": 1, "role": "active",  "model": "C9300-48P", "serial": "FCW2345A001", "version": "17.09.05", "state": "ready"},
                    {"switch_num": 2, "role": "standby", "model": "C9300-48P", "serial": "FCW2345A010", "version": "17.09.05", "state": "ready"},
                    {"switch_num": 3, "role": "member",  "model": "C9300-24T", "serial": "FCW2345A011", "version": "17.09.05", "state": "ready"},
                    {"switch_num": 4, "role": "member",  "model": "C9300-24T", "serial": "FCW2345A012", "version": "17.09.05", "state": "ready"},
                ]}),
            switch_schema({"name":"DIST-SW-02","ip_address":"10.0.1.2","model":"C9200L-24P",
                "platform":"IOS-XE","current_version":"17.12.03","serial_number":"FCW2345A002",
                "site":"HQ-Floor2","ssh_username":"admin","ssh_password":"cisco123",
                "enable_password":"enable123","status":"online","last_seen":datetime.now(timezone.utc),
                "is_stack": True, "stack_count": 2, "stack_master": "FCW2345A002",
                "stack_members": [
                    {"switch_num": 1, "role": "active",  "model": "C9200L-24P", "serial": "FCW2345A002", "version": "17.12.03", "state": "ready"},
                    {"switch_num": 2, "role": "standby", "model": "C9200L-24P", "serial": "FCW2345A020", "version": "17.12.03", "state": "ready"},
                ]}),
            switch_schema({"name":"ACC-SW-03","ip_address":"10.0.2.10","model":"C3850-24T",
                "platform":"IOS-XE","current_version":"16.12.10","serial_number":"FCW2345A003",
                "site":"Branch-Office-1","ssh_username":"admin","ssh_password":"cisco123",
                "enable_password":"enable123","status":"offline","last_seen":datetime(2025,2,28,tzinfo=timezone.utc)}),
            switch_schema({"name":"DC-NEXUS-01","ip_address":"10.0.3.1","model":"N9K-C9336C-FX2",
                "platform":"NX-OS","current_version":"10.4(2)","serial_number":"SAL2345B001",
                "site":"HQ-DataCenter","ssh_username":"admin","ssh_password":"cisco123",
                "status":"online","last_seen":datetime.now(timezone.utc)}),
            switch_schema({"name":"DC-NEXUS-02","ip_address":"10.0.3.2","model":"N9K-C9504",
                "platform":"NX-OS","current_version":"10.4(2)","serial_number":"SAL2345B002",
                "site":"HQ-DataCenter","ssh_username":"admin","ssh_password":"cisco123",
                "status":"online","last_seen":datetime.now(timezone.utc)}),
            switch_schema({"name":"BRANCH2-SW-01","ip_address":"10.0.4.1","model":"C9200-24T",
                "platform":"IOS-XE","current_version":"17.09.05","serial_number":"FCW2345A004",
                "site":"Branch-Office-2","ssh_username":"admin","ssh_password":"cisco123",
                "enable_password":"enable123","status":"online","last_seen":datetime.now(timezone.utc),
                "is_stack": True, "stack_count": 3, "stack_master": "FCW2345A004",
                "stack_members": [
                    {"switch_num": 1, "role": "active",  "model": "C9200-24T", "serial": "FCW2345A004", "version": "17.09.05", "state": "ready"},
                    {"switch_num": 2, "role": "standby", "model": "C9200-24T", "serial": "FCW2345A040", "version": "17.09.05", "state": "ready"},
                    {"switch_num": 3, "role": "member",  "model": "C9200-24T", "serial": "FCW2345A041", "version": "17.09.05", "state": "ready"},
                ]}),
        ]
        db.switches.insert_many(sws)
        print(f"  ✓ Seeded {len(sws)} switches")

    db.switches.create_index("ip_address", unique=True)
    db.switches.create_index("status")
    db.firmware.create_index([("platform",1),("model_family",1)])
    db.upgrade_history.create_index("job_id", unique=True)
    db.upgrade_history.create_index("created_at")
