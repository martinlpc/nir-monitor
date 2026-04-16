# Checkpoint: Frontend GeoTimestamp Refactor + PointsTable UI

**Fecha:** 16 de abril de 2026  
**Estado:** ✅ Completo y funcional

## Cambios Realizados

### 1. **useGeoData.ts** - Eliminada propiedad hdop
- ❌ Removida: `point.position.hdop`
- El center ahora solo usa `lat`, `lon`, `alt`

### 2. **PointsTable.tsx** - Renovación de columnas
- ❌ Eliminadas: columna HDOP, columna Interpolated
- ✅ Agregadas: columna "Valor medido" (emf.rss), columna "VALOR FINAL" (rssWithUncertainty)
- Usa `sequenceNumber` en columna `#` (con fallback a idx+1 para datos legacy)
- 8 columnas totales: `# | Timestamp | Lat | Lon | Alt(m) | Valor medido | VALOR FINAL | Unit`

### 3. **PointsTable.css** - Alineación y visual
- ✅ `table-layout: fixed` con anchos distribuidos: 5% | 18% | 13% | 13% | 8% | 18% | 18% | 7%
- ✅ `box-sizing: border-box` en th/td
- ✅ Bordes verticales entre columnas (azul sutil) para legibilidad
- ✅ Todas las columnas alineadas LEFT
- ✅ Headers sticky con z-index 10

## Estado del Backend
- ✅ GeoTimestamp.ts: `sequenceNumber`, `rssWithUncertainty` implementados
- ✅ Tests backend: 29/29 passing

## Próximas Fases
1. **Drawer AllSessions** — Panel deslizable no-bloqueante
2. **Multi-sesión simultánea en mapa** — Ver varias sesiones con colores diferentes
3. **Gestión de capas** — ON/OFF checkbox por sesión en el drawer

---

**Para revertir:** Todos los cambios están en los 3 archivos de production/ mencionados arriba.
