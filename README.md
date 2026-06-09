# nir-monitor

**Non-Ionizing Radiation Mapper** — A desktop application for mapping electromagnetic field (EMF) measurements based on **ITU-T Recommendation K.113**.

Developed by the [Ente Nacional de Comunicaciones (ENACOM)](https://www.enacom.gob.ar), Argentina's national communications agency.

## Overview

`nir-monitor` connects to a **Narda NBM-550** broadband EMF meter and a **GPS receiver** (NMEA 0183-compatible) via serial port to capture georeferenced electromagnetic field readings. Data is visualized in real-time on an interactive map, stored locally in a SQLite database, and can be exported in multiple industry-standard formats.

## Features

- **Device management** — Auto-scan serial ports, connect/disconnect to NBM-550 and GPS, with automatic reconnection on unexpected disconnection.
- **Real-time capture** — Poll the NBM-550 at 200 ms intervals and fuse readings with GPS position using distance-based (Haversine) or time-based triggers.
- **Interactive map** — Visualize measurement points on a Leaflet map with color-coded intensity markers and route polylines.
- **Session management** — Start, pause, resume, and stop measurement sessions. Load and compare historical sessions from local storage.
- **Correction factors** — Apply probe-specific uncertainty correction factors loaded from TSV/CSV files.
- **Simulation mode** — Run with `NIR_SIMULATION=true` environment variable to use simulated device drivers, useful for development and testing without physical hardware.
- **Multi-format export** — Export sessions as GeoJSON, CSV, XLSX (Excel with summary + data sheets), or KMZ (Google Earth).
- **Auto-update (planned)** — Built-in update mechanism via electron-updater.

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 42 |
| Frontend | React 19, TypeScript 5.9, Vite 7 |
| Maps | Leaflet 1.9, react-leaflet 5 |
| Serial communication | serialport 13 |
| GPS parsing | nmea-simple |
| Database | SQLite via sql.js (WebAssembly) |
| Export | exceljs (XLSX), archiver (KMZ/ZIP) |
| Testing | Vitest |
| Packaging | electron-builder (Windows, macOS, Linux) |

## Prerequisites

- **Node.js** >= 20
- **npm** >= 9

## Setup

```bash
# Install dependencies
npm install

# Run in development mode (with hot reload)
npm run dev

# Run tests
npm test

# Lint
npm run lint
```

## Build

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

Build artifacts are placed in the `dist/` directory.

## Architecture

The application follows a **clean layered architecture** with three processes:

```
┌─────────────────────────────────────────────────┐
│                 Renderer Process                │
│             (React 19 + Leaflet)                │
│     Hooks → Components → Map + Table UI         │
└──────────────────────┬──────────────────────────┘
                       │ IPC (contextBridge)
┌──────────────────────▼──────────────────────────┐
│                  Main Process                   │
│         DeviceManager → GeoFusionService        │
│              → SessionService → SQLiteRepo      │
└──────┬─────────────────────────────────┬────────┘
       │                                 │
       ▼                                 ▼
  NBM-550 (serial)                 GPS (serial)
  460800 baud, binary              4800 baud, NMEA 0183
```

## Export Formats

| Format | Description |
|---|---|
| **GeoJSON** | Standard GIS interchange format |
| **CSV** | Flat table of all measurement points |
| **XLSX** | Excel workbook with summary + raw data sheets |
| **KMZ** | Compressed KML for Google Earth |

## Database Encryption

The SQLite database (`sessions.db`) is encrypted at rest using **AES-256-GCM**
with a shared passphrase to prevent manual tampering.

### Configuration

Set the `NIR_DB_ENCRYPTION_KEY` environment variable with a passphrase
agreed upon by all teams that need access:

```ini
# .env (gitignored — never commit the passphrase)
NIR_DB_ENCRYPTION_KEY=passphrase-compartida-entre-equipos
```

The passphrase is converted to a 256-bit AES key via SHA-256, producing the
same key on every machine with the same passphrase.

> ⚠️ `.env` is in `.gitignore` — the key **never** enters the repository.

### Environment variable

| Variable | Required | Description |
|---|---|---|
| `NIR_DB_ENCRYPTION_KEY` | Yes | Shared passphrase (any string) |

If not set, the app throws a clear error at startup.

### Legacy migration

Existing unencrypted databases are detected automatically on first load and
migrated to the encrypted format on the next save. No manual steps needed.

### Security note

In production, inject the passphrase through your deployment mechanism
(CI variables, electron-builder config, systemd environment, etc.).

## License

This project is developed by ENACOM. See license information in the repository.
