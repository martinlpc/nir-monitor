# Layout portrait / híbrido

Cómo se comporta la interfaz de producción cuando la pantalla está en vertical
(`@media (orientation: portrait)`). Es el modo pensado para la tablet en campo.

## Esquema

```
┌──────────────────────────────────┐
│ [Dispositivos] [Historial] [⚙]  │ ← barra tabs compacta
├──────────────────────────────────┤
│ ┌─ panel-content (dropdown) ──┐  │ ← se abre al tocar un tab,
│ │ GPS: Connected    [▶]       │  │    se cierra al mismo tab
│ │ NBM: Connected              │  │    o tocando fuera (backdrop)
│ │ [Modo Time] [10s]           │  │
│ └─────────────────────────────┘  │
│            M A P                 │ ← ancho completo
├──────────────────────────────────┤
│ Puntos (32)                [▼]  │ ← tabla colapsable
└──────────────────────────────────┘
```

## Comportamiento

- La sidebar se convierte en una **barra delgada de tabs** en la parte superior.
- El contenido del tab activo se despliega como **dropdown overlay** sobre el mapa, con animación
  de entrada (`panelFadeSlide`).
- El mapa ocupa el **ancho completo**, con padding reducido.
- La lista de dispositivos pasa a **grilla de 2 columnas**.
- La tabla de puntos es un **acordeón colapsable** (▼/▲), colapsado por defecto en vertical.
- Un **backdrop oscurecido con blur** cubre el resto de la pantalla y cierra el panel al tocar fuera.
- Se ocultan los controles de tamaño de fuente, la info de dispositivos y el session-ID.
- La detección de orientación es en **tiempo real** vía `matchMedia`; al rotar a landscape se
  restaura el layout original y el panel se cierra.

## Dónde vive

| Archivo                                                      | Qué define                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `src/renderer/src/components/production/production.css`      | Bloque `@media (orientation: portrait)` y el `.portrait-backdrop`            |
| `src/renderer/src/components/production/PointsTable.css`     | Ajustes de la tabla en vertical (paddings, toolbar, elementos ocultos)       |
| `src/renderer/src/components/production/ProductionShell.tsx` | Estado `isPortrait` / `panelOpen`, `handleTabClick` y el render del backdrop |
| `src/renderer/src/components/production/PointsTable.tsx`     | Estado `tableCollapsed` del acordeón                                         |
