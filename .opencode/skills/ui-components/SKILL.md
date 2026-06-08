---
name: ui-components
description: React component structure — debug panels, production shell, map views, hooks
---

Root: `src/renderer/src/components/`

## Modo Debug (`?debug=1`)
- `debug/DebugPanel.tsx` — panel principal debug (tabs)
- `debug/DebugDevicesPanel.tsx` — estado de dispositivos
- `debug/DebugSessionPanel.tsx` — sesion activa
- `debug/DebugHero.tsx` — stats generales
- `debug/DebugLogPanel.tsx` — logs en tiempo real
- `debug/DebugDeviceCard.tsx` — card individual de dispositivo
- `debug/DebugStat.tsx` — componente de estadistica
- Hooks: `useDebugDevices`, `useDebugGps`, `useDebugLogs`, `useDebugPanelState`

## Modo Production
- `production/ProductionShell.tsx` — layout principal con tabs
- `production/DevicesPanel.tsx` — estado de dispositivos
- `production/useDeviceCardState.ts` — hook de estado
- `production/DeviceCard.tsx` — card de dispositivo
- `production/SessionsPanel.tsx` — sesiones activas y guardadas
- `production/SessionItem.tsx` — item de lista de sesion
- `production/AllSessionsDrawer.tsx` — drawer de sesiones guardadas
- `production/PointsTable.tsx` — tabla de puntos capturados
- `production/SettingsPanel.tsx` — configuracion (incertidumbre)
- `production/Toast.tsx` + `ToastProvider.tsx` — notificaciones toast

## Mapas
- `map/MapView.tsx` — componente Leaflet principal
- `map/SyncMapView.tsx` — sincronizado con sesion activa
- `map/MaximizeControl.tsx` — boton de pantalla completa
- `map/PanControl.tsx` — control de paneo

## Modales
- `SessionStartModal.tsx` — modal de inicio de sesion (config trigger, datos de ubicacion)

## App
- `App.tsx` — entry point: detecta debug mode y renderiza DebugPanel o ProductionShell
- `ErrorBoundary.tsx` — error boundary global

## Hooks
- `src/renderer/src/hooks/useDevices.ts` — estado de dispositivos
- `src/renderer/src/hooks/useSession.ts` — sesion activa
- `src/renderer/src/hooks/useGeoData.ts` — datos geograficos para el mapa
- `src/renderer/src/hooks/useGpsPosition.tsx` — posicion GPS en tiempo real
- `src/renderer/src/hooks/usePersistentSessions.ts` — sesiones guardadas
- `src/renderer/src/hooks/useMultipleSessions.ts` — multiples sesiones en mapa

## IPC bridge
- `src/preload/index.ts` — `window.api` expuesto via contextBridge
- Namespaces: `api.ports`, `api.devices`, `api.gps`, `api.nbm`, `api.session`, `api.settings`
