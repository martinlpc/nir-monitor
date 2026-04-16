# Diseño: AllSessionsDrawer + Multi-Sesión en Mapa

## Visión General

```
┌─────────────────────────────────────────────────────────┐
│ Mapa (ProductionShell)                      [>] Drawer  │
│                                                          │
│  [Route 1 - Rojo]                   ┌──────────────┐   │
│  [Route 2 - Azul]                   │ All Sessions │   │
│  [Route 3 - Verde]                  │              │   │
│  [Actual sesión - Amarillo]         │ ☐ Sesión A   │   │
│                                      │ ☑ Sesión B   │   │
│                                      │ ☐ Sesión C   │   │
│                                      │              │   │
│                                      │ [Cargar ▶]  │   │
│                                      │              │   │
│                                      └──────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Componentes Nuevos

### 1. **AllSessionsDrawer.tsx**
```typescript
interface AllSessionsDrawerProps {
  isOpen: boolean
  onClose: () => void
  // sesiones de hook usePersistentSessions()
}

// Estado local:
// - checkedSessions: Set<string> — cuáles sesiones mostrar
// - searchQuery: string — filtrar por nombre
// - sortBy: 'date' | 'name' — ordenar
```

### 2. Hook: **useMultipleSessions()** (nuevo)
```typescript
interface LoadedSession {
  id: string
  label: string
  points: GeoTimestamp[]
  color: string // #FF5733, #3399FF, etc.
  visible: boolean
}

// Estado:
// - loadedSessions: LoadedSession[] — todas cargadas
// - addSession(id) — cargar + agregar a mapa
// - removeSession(id) — quitar del mapa
// - toggleSession(id) — ON/OFF sin descargar
// - setColor(id, color) — cambiar color de línea/puntos
```

### 3. Modificar: **MapView.tsx**
```typescript
// En lugar de un solo GeoTimestamp[], recibir:
// loadedSessions: LoadedSession[]

// Renderizar:
// - Múltiples Polylines (una por sesión, color diferente)
// - Múltiples Markers (puntos de cada sesión, con tooltip de sesión)
// - Layer control para activar/desactivar
```

## Flujo de Interacción

1. Usuario hace click en **"Ver todas"** en SessionsPanel
2. Se abre Drawer desde la derecha (mapa sigue visible)
3. Ve lista de TODAS las sesiones con checkboxes
4. Marca checkbox → se carga sesión y aparece en el mapa con color único
5. Puede marcar múltiples → aparecen todas superpuestas
6. Click en sesión → muestra detalles en un mini-panel
7. Click "Cargar principal" → lleva esa sesión al flujo actual (reemplaza)

## Colores Dinámicos

Palette de 10 colores predefinidos:
```typescript
const COLORS = [
  '#FF5733', // Rojo
  '#3399FF', // Azul
  '#2ECC71', // Verde
  '#F39C12', // Naranja
  '#9B59B6', // Púrpura
  '#1ABC9C', // Turquesa
  '#E74C3C', // Rojo oscuro
  '#34495E', // Gris
  '#FFD700', // Dorado
  '#FF69B4'  // Rosa
]
```

Cuando carga sesión N-ésima → color = COLORS[N % 10]

## Estado en ProductionShell

```typescript
const [visibleSessions, setVisibleSessions] = useState<LoadedSession[]>([])
const [drawerOpen, setDrawerOpen] = useState(false)

// En MapView:
<MapView 
  currentSession={session} 
  loadedSessions={visibleSessions}
  // ... otros props
/>

// En SessionsPanel:
<button onClick={() => setDrawerOpen(true)}>
  Ver todas ({sessions.length})
</button>

// Drawer:
{drawerOpen && (
  <AllSessionsDrawer 
    isOpen={drawerOpen}
    onClose={() => setDrawerOpen(false)}
    onSessionToggle={(sessionId, checked) => {
      if (checked) {
        // cargar + agregar
      } else {
        // remover
      }
    }}
  />
)}
```

## Archivos a Crear/Modificar

**Crear:**
- `src/renderer/src/components/production/AllSessionsDrawer.tsx`
- `src/renderer/src/components/production/AllSessionsDrawer.css`
- `src/renderer/src/hooks/useMultipleSessions.ts`

**Modificar:**
- `src/renderer/src/components/production/ProductionShell.tsx` — agregar estado + drawer
- `src/renderer/src/components/map/MapView.tsx` — soportar múltiples sesiones
- `src/renderer/src/components/production/SessionsPanel.tsx` — botón "Ver todas"

---

**Próximo paso:** ¿Listo para implementar?
