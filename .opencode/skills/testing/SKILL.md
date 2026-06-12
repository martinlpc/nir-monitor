---
name: testing
description: Testing conventions for nir-monitor — Vitest, coverage thresholds, serial mocking
---

- Framework: Vitest 4.1 con node environment
- Test files: `src/**/*.test.ts`
- Timeout: 15s (tests con hardware/scanning pesado)
- Coverage thresholds: lines 80%, functions 80%, branches 75%, statements 80%
- Provider: v8

## Mocking serialport

```typescript
import { vi } from 'vitest'

vi.mock('serialport', () => {
  const EE = require('events')
  class MockSerialPort extends EE {
    path: string
    baudRate: number
    constructor(options: any) {
      super()
      this.path = options.path
      this.baudRate = options.baudRate
    }
    write() {
      return true
    }
    close() {
      this.emit('close')
    }
  }
  class MockReadlineParser extends require('stream').Transform {
    _transform(chunk: any, _: any, cb: any) {
      cb(null, chunk)
    }
  }
  return { SerialPort: MockSerialPort, ReadlineParser: MockReadlineParser }
})
```

## Mocking Electron IPC

```typescript
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeAllListeners: vi.fn() },
  ipcRenderer: { on: vi.fn(), removeListener: vi.fn(), invoke: vi.fn() },
  contextBridge: { exposeInMainWorld: vi.fn() },
  BrowserWindow: { getAllWindows: () => [{ webContents: { send: vi.fn() } }] },
  app: { getPath: () => '/tmp', on: vi.fn() }
}))
```

## Comandos

- `npm test` -> vitest run
- `npm run test:watch` -> watch mode
- `npm run test:coverage` -> con reporte HTML
