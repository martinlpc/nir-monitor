# 0.15.0 — 2026-07-08

### Correcciones

- embed circle+arrow in single SVG rotated around center
- prevent duplicate session import and fix duration parsing
- prevent loading a saved session during active measurement

### Novedades

- add changelog system with generation script and in-app display
- add heading field to GPS position pipeline
- add heading indicator arrow on GPS marker
- show heading arrow only when GPS speed > 1 km/h

# 0.14.0 — 2026-07-06

### Correcciones

- add observability logging for NBM disconnection watchdog
- prevent crash on NBM disconnection during active session
- relabel popup measurement as 'Valor medido' and drop redundant raw line

### Novedades

- persist GPS loss as gpsGap flag and render gap segments in gray

# 0.12.0 — 2026-07-03

### Correcciones

- correct color palette threshold and embed legend in KMZ
- stabilize NBM-550 reconnection flow and fix toast text
- update gitlab URL in agent and readme files

### Novedades

- add bidirectional table-map interaction with scroll-to-row
- add map selection rectangle, reconnection toast fix, portrait layout

# 0.9.0 — 2026-06-25

### Correcciones

- improve portrait layout with proper stacking and full-height panel

## 0.8.1 — 2026-06-25

### Correcciones

- cap preload max zoom at 18 and auto-set min zoom from map view
- replace zoom number input spinners with separate +/- buttons for better tablet usability

### Novedades

- add portrait/hybrid layout for vertical screen orientation
- disable dev tools in production and start maximized
- improve GPS timestamp precision, add e2e test, and refactor GeoFusionService
- improve icon, tooltip format, highlight support with StyleMap, and add app version
- show export errors as toasts instead of silent console logs

# 0.8.0 — 2026-06-24

### Novedades

- raise session point limit from 2500 to 5000 with DB rejection on addPoint

# 0.7.0 — 2026-06-23

### Novedades

- add IPC security, export 2500-pt limit, log service, and error sanitization
- add NBM polling controller, ConfigService, DriverFactory, and expanded tests

# 0.6.0 — 2026-06-18

### Correcciones

- bundle probe-data.json and plantillas as extraResources

### Novedades

- add structured error system with AppError, NBM codes, and actionable toasts
- inject NIR_DB_ENCRYPTION_KEY via NSIS installer
- bundle FTDI and Prolific USB drivers in installer with runtime check and install
- embed probe correction factor data instead of manual file selection
- hide clear button during session and remove auto-fitBounds per point
- set simulated NBM550 serial to SIM-0001 for both meter and probe
- show app version in settings and window title

# 0.1.0 — 2026-06-16

### Correcciones

- add in-memory test support, fix timestamp conversion and cascade delete
- add SessionStats interface, implement FileSessionRepository methods, fix buildKML types
- use MEP threshold colors matching app, fix XML escaping and description format
- prevent uncaught serial port error during disconnect by reordering cleanup
- resolve race condition in NBM550Driver command execution and improve polling mechanism in DeviceManager
- simulation mode saves multiple points per session
- stop active session before disconnect on app quit
- stop auto-enabling follow-position on session clear, fix modal label contrast

### Novedades

- add --simulation flag, unlock zoom on follow, set install path
- add 7 skills — geo-fusion, serial-probing, ipc-channels, session-lifecycle, electron-setup, ui-components, build-packaging
- add backend expert agent for device communication and data processing
- add build-publisher agent for build, packaging and release pipeline
- add commit-conventions skill with conventional commits rules
- add dark/soft theme system with CSS custom properties
- add debug panel components and device management features
- add font-size controls and maximize toggle to points table
- add GPS and NBM550 device drivers with support for serial communication
- add NbmStatusBadge component and update map styles
- add pan and maximize controls to map view with corresponding styles
- add PointsTable component and integrate with ProductionShell
- add session name input field and styling to DevicesPanel
- add settings panel for loading uncertainty files with UI integration
- add stop session confirm and wrap session-info items
- add test script for NBM-550 and GPS fusion, including command-line options
- add tile cache on disk with protocol handler and zone preload
- add trigger mode UI controls and toast errors
- conditionally render lastPoint marker based on session activity
- encrypt SQLite database with AES-256-GCM
- unify EMF conversion module, add location fields to DB schema, update UI palette
- enhance GeoTimestamp and related services to include sequence number and RSS with uncertainty
- enhance GPS functionality with NMEA support and improve UI for device management
- enhance NBM550 driver and diagnostics with improved timeout handling and new test scripts
- enhance NBM550Driver and NBM550Parser with error handling and measurement parsing improvements
- enhance NBM550Driver and NBM550Parser with probe info retrieval and error handling; update SettingsPanel for active uncertainty display
- enhance PointsTable and SessionsPanel with improved styling and functionality
- Enhance session handling with correction factors and device metadata
- replace XLSX generation with institutional ENACOM templates
- implement AllSessionsDrawer component for session management
- implement auto-loading of uncertainty files and enhance settings panel with probe info display
- implement device-specific disconnection in DeviceManager and update IPC handler
- implement global alert system with Toast notifications and logging
- implement GPS position context and enhance map view with maximize functionality
- implement IPC communication and device management in the main process
- implement service factory pattern with dependency injection for DeviceManager and SessionService
- implement session deletion functionality with confirmation in AllSessionsDrawer and SessionItem components
- implement session management with init, addPoint, and finalize methods in session repositories
- integrate Leaflet and React-Leaflet for GPS tracking visualization and enhance IPC handlers for GPS position updates
- iOS-style toggle trigger mode, fix duplicate toasts, dark toast theme
- migrate agents to .opencode/ and add AGENTS.md, CLAUDE.md, opencode.json, skills
- Refactor map and device management components
- refactor SettingsPanel to improve probe info and active uncertainty handling
- session location modal with provincia/localidad cascade and apellido fields
- simulator respects user trigger mode and interval/distance config
- switch province/locality data to shared INDEC JSON format
- sync CLAUDE.md with AGENTS.md — add key files, agents, and skills sections
- unify distance guard across time/distance modes + simulation override
- update device type display in DeviceCard to show localized name for 'emf'

