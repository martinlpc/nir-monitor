# Mock Data Seeding

Este directorio contiene scripts para generar y poblar la base de datos con sesiones de prueba realistas.

## Scripts

### `seedMockSessions.ts`

Generador de sesiones mock alrededor de Neuquén, Argentina.

**Características:**

- 6 rutas diferentes con nombres realistas
- 18-30 puntos por sesión
- Coordenadas interpoladas entre inicio y fin
- Valores EMF variables y realistas (2.1 - 9.3 V/m)
- Factores de incertidumbre (0-15%)
- Fechas distribuidas en los últimos 7 días

**Rutas generadas:**

1. Recorrido Ruta 9 Norte
2. Medición Centro - Pellegrini
3. Ruta sur hacia Río Negro
4. Avenida Argentina Este
5. Zona industrial Oeste
6. Circuito urbano general

### `seedDatabase.ts`

Script CLI que ejecuta el seed en la base de datos SQLite.

## Uso

```bash
# Generar y guardar 6 sesiones mock en la DB
npm run seed:mock
```

Esto:

1. ✓ Genera 6 sesiones con rutas realistas alrededor de Neuquén
2. ✓ Guarda metadatos (label, fecha, puntos, instrumento)
3. ✓ Guarda todos los puntos con GPS + EMF
4. ✓ Calcula estadísticas (avg/max/min RSS)
5. ✓ Persiste en `userData/sessions.db`

## Después del seed

Inicia la app normalmente:

```bash
npm run dev
```

Las 6 sesiones aparecerán en:

- ✅ Listado de sesiones (canal IPC `session:list-persisted`)
- ✅ Cada sesión se puede ver completa
- ✅ Se pueden exportar (GeoJSON, CSV, KMZ)

## Nota

El script genera datos determinísticos (usa `Math.random()` pero siempre la misma cantidad de puntos y rutas). Si quieres regenerar, simplemente ejecuta `npm run seed:mock` nuevamente (sobrescribe las sesiones anteriores).
