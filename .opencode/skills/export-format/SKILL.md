---
name: export-format
description: Export formats for sessions — GeoJSON, CSV, XLSX, KMZ
---

Implemented in `src/main/services/SessionService.ts` (orchestrator) and
`src/main/services/SQLiteSessionRepository.ts` (data serialization).

## GeoJSON (RFC 7946)
- FeatureCollection con features Point
- Coordenadas: `[longitude, latitude, altitude]` (lon/lat orden GeoJSON standard)
- Properties por punto: `rss`, `rssWithUncertainty`, `unit`, `sequenceNumber`, `timestamp` (ISO)
- Top-level `properties`: session metadata, instrument info, correction factor, stats

## CSV
- quoted comma-separated
- Headers: `Timestamp`, `Sequence#`, `Latitude`, `Longitude`, `Altitude (m)`, `RSS (medido)`, `RSS (corregido)`, `Unit`
- Coordenadas Lat/Lon a 8 decimales
- BOM al inicio para Excel

## XLSX (via exceljs)
- Sheet 1 "Resumen": metadata de sesion, instrumento, stats
- Sheet 2 "Datos": filas de puntos con auto-filter
- Columnas: `Sequence`, `Timestamp`, `Latitud`, `Longitud`, `Altitud`, `RSS`, `RSS (corregido)`, `Unit`

## KMZ (KML comprimido via archiver)
- `<Document>` con `<LineString>` del recorrido
- `<Placemark>` por punto con `<IconStyle>` color-coded (verde -> amarillo -> rojo segun RSS)
- Cada point tiene `<ExtendedData>`: `rss`, `rssWithUncertainty`, `unit`, `hdop`, `interpolated`
- Coordenadas KML: `<coordinates>lon,lat,alt</coordinates>`

## Sistema de coordenadas
- WGS 84 (EPSG:4326)
- Decimal degrees para lat/lon
- Altitud en metros
