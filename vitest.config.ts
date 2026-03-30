import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 15000, // Aumentar timeout para tests con hardware/scanning
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/**/*.d.ts',
        'src/**/index.ts'
      ],
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80
    }
  }
})
