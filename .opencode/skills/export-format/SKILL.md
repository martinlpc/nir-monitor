---
name: export-format
description: Export formats for sessions — GeoJSON, CSV, XLSX, KMZ
---

- GeoJSON: RFC 7946, FeatureCollection con Point geometry
- CSV: tab-separated (TSV), con cabeceras
- XLSX: ExcelJS, hoja con datos de puntos + metadatos de sesión
- KMZ: KML comprimido (archiver + zlib)
- Archivo clave: `src/main/services/SessionService.ts` (métodos exportGeoJSON, exportCSV, export)
