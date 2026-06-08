---
name: testing
description: Testing conventions for nir-monitor — Vitest, coverage thresholds, serial mocking
---

- Framework: Vitest 4.1 con node environment
- Test files: `src/**/*.test.ts`
- Timeout: 15s (tests con hardware/scanning pesado)
- Coverage thresholds: lines 80%, functions 80%, branches 75%, statements 80%
- Provider: v8
- Para simular SerialPort en tests, usar `vi.mock('serialport')`
- `npm test` → vitest run
- `npm run test:watch` → watch mode
- `npm run test:coverage` → con reporte HTML
