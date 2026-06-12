# Plan: Passphrase-based DB encryption

## 1. Modificar `src/main/services/CryptoService.ts`

Reemplazar `getKey()`:

```typescript
function getKey(): Buffer {
  const passphrase = process.env.NIR_DB_ENCRYPTION_KEY
  if (!passphrase) {
    throw new Error(
      'NIR_DB_ENCRYPTION_KEY environment variable is not set.\n' +
        'Create a .env file with: NIR_DB_ENCRYPTION_KEY=<passphrase-compartida>\n' +
        'Or set it before launching the app.'
    )
  }
  return crypto.createHash('sha256').update(passphrase, 'utf8').digest()
}
```

## 2. Actualizar `.env.example`

```
# Passphrase para cifrado de la base de datos SQLite (AES-256-GCM)
# Debe ser la misma en todos los equipos que compartan la DB
# Se convierte a clave AES-256 via SHA-256
NIR_DB_ENCRYPTION_KEY=passphrase-acordada-con-el-equipo
```

## 3. Agregar sección en `README.md`

Entre "Export Formats" y "License":

````markdown
## Database Encryption

The SQLite database (`sessions.db`) is encrypted at rest using **AES-256-GCM**
with a shared passphrase to prevent manual tampering.

### Configuration

Set the `NIR_DB_ENCRYPTION_KEY` environment variable with a passphrase
agreed upon by all teams that need access:

```ini
# .env (gitignored — never commit the passphrase)
NIR_DB_ENCRYPTION_KEY=passphrase-compartida-entre-equipos
```
````

The passphrase is converted to a 256-bit AES key via SHA-256, producing the
same key on every machine with the same passphrase.

> ⚠️ `.env` is in `.gitignore` — the key **never** enters the repository.

### Environment variable

| Variable                | Required | Description                    |
| ----------------------- | -------- | ------------------------------ |
| `NIR_DB_ENCRYPTION_KEY` | Yes      | Shared passphrase (any string) |

If not set, the app throws a clear error at startup.

### Legacy migration

Existing unencrypted databases are detected automatically on first load and
migrated to the encrypted format on the next save. No manual steps needed.

### Security note

In production, inject the passphrase through your deployment mechanism
(CI variables, electron-builder config, systemd environment, etc.).

````

## 4. Verificación

```bash
npm run typecheck
npm test
````
