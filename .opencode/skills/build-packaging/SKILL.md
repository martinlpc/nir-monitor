---
name: build-packaging
description: Build and packaging configuration for Windows, macOS, and Linux using electron-builder
---

Archivo: `electron-builder.yml`

## appId

`com.enacom.rni-monitor`

## Scripts

```bash
npm run build          # typecheck + electron-vite build
npm run build:win      # electron-builder --win  -> NSIS installer
npm run build:mac      # electron-vite build && electron-builder --mac -> DMG
npm run build:linux    # electron-vite build && electron-builder --linux -> AppImage/snap/deb
npm run build:unpack   # electron-builder --dir  -> directorio sin empaquetar
```

## Output structure

- `out/` -> electron-vite build output (main + preload + renderer)
- `dist/` -> installers generados por electron-builder

## Windows (NSIS)

```yaml
win:
  executableName: rni-monitor
nsis:
  artifactName: ${name}-${version}-setup.${ext}
  shortcutName: ${productName}
  uninstallDisplayName: ${productName}
  createDesktopShortcut: always
```

- Output: `rni-monitor-1.0.0-setup.exe`

## macOS (DMG)

```yaml
mac:
  entitlementsInherit: build/entitlements.mac.plist
  notarize: false
dmg:
  artifactName: ${name}-${version}.${ext}
```

- Entitlements: camera, microphone, documents, downloads
- Notarization: deshabilitada (configurar para distribucion oficial)
- Output: `rni-monitor-1.0.0.dmg`

## Linux

```yaml
linux:
  target:
    - AppImage
    - snap
    - deb
  category: Utility
appImage:
  artifactName: ${name}-${version}.${ext}
```

- Output: `rni-monitor-1.0.0.AppImage`

## Auto-update (electron-updater)

```yaml
publish:
  provider: generic
  url: https://example.com/auto-updates
```

- Provider generico (placeholder URL)
- `dev-app-update.yml` para desarrollo

## Files incluidas en el build

- Se excluyen: `src/`, `.vscode/`, configs de electron-vite, eslint, prettier, tsconfig...
- `asarUnpack`: `resources/**`

## Build pipeline completo

```
npm run build
  -> tsc --noEmit (node + web)   # typecheck
  -> electron-vite build          # bundle main + preload + renderer

npm run build:win
  -> npm run build
  -> electron-builder --win       # empaqueta en NSIS
```

## Notas importantes

- `npmRebuild: false` — no rebuild nativas (serialport ya viene prebuild)
- `electron-vite build` produce archivos en `out/`
- El installer incluye todo lo necesario (Node.js embebido, sql.js WASM)
