# Cisco Switch Upgrade Manager

Full-stack application for managing and automating Cisco switch firmware upgrades via SSH.

```
┌─────────────────────────────────────────────────────────────────┐
│                   Angular 17 Frontend                           │
│  Dashboard  │  Switch Inventory  │  Firmware  │  Upgrade Center │
└─────────────────────────┬───────────────────────────────────────┘
                          │ REST API + SSE (real-time progress)
┌─────────────────────────▼───────────────────────────────────────┐
│                     Flask Backend                               │
│  API Routes  │  Upgrade Engine (Netmiko SSH)  │  Background Jobs│
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                       MongoDB                                   │
│  switches  │  firmware  │  upgrade_history                      │
└─────────────────────────────────────────────────────────────────┘
```

## Features

- **Switch Inventory** — Add manually, bulk import, or auto-discover via SSH
- **Firmware Catalog** — IOS-XE / NX-OS / IOS images with version tracking
- **Batch Upgrades** — Select multiple switches, upgrade simultaneously
- **Real-Time Progress** — SSE streaming with animated progress rings + step timeline
- **Dashboard** — Health overview, version distribution, upgrade history
- **Pre/Post Checks** — Automated validation (disk space, config backup, version verify)
- **Compatibility Matrix** — Auto-filters firmware by switch platform/model

## Quick Start

### Prerequisites
- Python 3.10+, Node.js 18+, Angular CLI 17+, MongoDB 6.0+

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py                    # → http://localhost:5000
```

### Frontend
```bash
cd frontend
npm install
ng serve --proxy-config proxy.conf.json   # → http://localhost:4200
```

### Production Mode (real SSH)
```bash
SIMULATION_MODE=false python app.py
```

## API Endpoints

| Method | Endpoint                            | Description                  |
|--------|-------------------------------------|------------------------------|
| GET    | /api/switches                       | List switches (with filters) |
| POST   | /api/switches                       | Add a switch                 |
| PUT    | /api/switches/:id                   | Update a switch              |
| DELETE | /api/switches/:id                   | Delete a switch              |
| POST   | /api/switches/discover              | Auto-discover via SSH        |
| GET    | /api/firmware                       | List firmware images         |
| POST   | /api/firmware                       | Add firmware entry           |
| DELETE | /api/firmware/:id                   | Delete firmware              |
| POST   | /api/upgrades/start                 | Start upgrade job(s)         |
| GET    | /api/upgrades/progress/:id          | Poll progress                |
| GET    | /api/upgrades/progress/:id/stream   | SSE real-time stream         |
| GET    | /api/upgrades/active                | Active jobs                  |
| GET    | /api/upgrades/history               | Upgrade audit log            |
| GET    | /api/dashboard/stats                | Dashboard statistics         |
