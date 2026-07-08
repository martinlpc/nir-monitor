---
name: commit-conventions
description: Git commit conventions for RNI Monitor — conventional commits, English only, human language
---

## Formato

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>
```

### Types

| Type       | Usage                                   |
| ---------- | --------------------------------------- |
| `feat`     | New feature                             |
| `fix`      | Bug fix                                 |
| `refactor` | Code change that neither fixes nor adds |
| `perf`     | Performance improvement                 |
| `test`     | Adding or fixing tests                  |
| `docs`     | Documentation only                      |
| `style`    | Formatting, lint, missing semicolons    |
| `chore`    | Build, deps, CI, config                 |
| `ci`       | CI pipeline changes                     |

## Reglas

1. **Always in English** — subject and body
2. **Human language** — no em dashes (—), no robotic phrasing. Write as you would explain it to a teammate
3. **Subject** — lowercase after `type:`, no period, max ~72 chars. Imperative mood ("add", "fix", "remove")
4. **Body** — only if strictly necessary. Blank line after subject. Bullet points (`-`) if multiple clarifications are unavoidable
5. **Scope** — optional, use lowercase (`feat(db):`, `fix(export):`)
6. **Breaking changes** — add `!` after type/scope: `feat!: drop support for X`

## Examples

```
feat: add correction factor TSV loader with validation
```

```
fix: prevent crash on empty serial port list
```

```
refactor: extract Haversine distance to shared util
```

```
feat(db): batch geo_points inserts every 30s
```

```
fix(export): encode KMZ icons in base64 to avoid broken paths
```

```
chore: bump electron from 42.0.0 to 42.1.0
```

## Version bump

Before committing, evaluate whether the changes warrant a version bump:

- **feat** → minor bump (`0.3.0` → `0.4.0`)
- **fix** → patch bump (`0.3.0` → `0.3.1`)
- **Breaking change** → major bump (`1.0.0` → `2.0.0`)
- **chore / refactor / docs / style / test / ci** → no bump needed

**Always consult the user before bumping the version.** Ask which version they want, do not decide on your own.

Update `package.json` → `version` field, then commit it as:

```
chore: bump version to X.Y.Z
```

## Release workflow

### Flujo completo (GitLab + GitHub mirror)

El desarrollo se organiza con GitLab como repositorio primario (código + issues)
y GitHub como mirror profesional.

1. Si la rama surge de una issue de GitLab, referenciarla en el nombre y MR.
   Si no (cambios ad-hoc como este), simplemente se omite la referencia.
   - Con issue: `fix/1-disable-load-during-session`
   - Sin issue: `chore/release-workflow`
2. `git pull gitlab main` — asegurar local actualizado
3. `git checkout -b <tipo>/<descripcion>` — crear rama desde `gitlab/main`
   - Ej: `fix/1-disable-load-during-session`, `feat/locations-indec-json`
4. Hacer los cambios con commits convencionales (ver tipos arriba)
5. Evaluar si corresponde version bump (ver reglas en sección anterior)
6. **Siempre consultar al usuario antes de bumpear.** No decidir por cuenta propia.
7. Si aplica bump (se hace en este orden):
   ```
   a. Actualizar campo "version" en package.json
   b. npm run changelog              # regenera CHANGELOG.md con la nueva versión
   c. git add CHANGELOG.md package.json package-lock.json
   d. git commit -m "chore: bump version to X.Y.Z"
   ```
8. Actualizar `docs/manual.html`:
   - **Portada y footer:** actualizar versión SIEMPRE que haya bump (debe coincidir
     con `package.json`)
   - **Contenido:** solo si los cambios afectan flujo de conexión, parámetros de
     captura, comportamiento de sesión, formatos de exportación, configuración de
     mapa o modo simulación
9. `git push gitlab <nombre-de-rama>`
10. Crear MR en GitLab:
    - **Título:** el mensaje del cambio funcional, no el bump
      - Ej: `fix(#1): prevent loading a saved session during active measurement`
    - **Descripción:** incluir versión nueva si aplica
      ```
      ## Description
      <explicación del cambio>

      ## Changelog
      - vX.Y.Z (<tipo>)
      - closes #<issue>
      ```
    - **Label:** según el tipo de cambio
      - `type::bug` (fix), `type::feature` (feat), `type::refactor` (refactor),
        `type::chore` (chore / docs / style / ci)
    - Marcar "Delete source branch when merge request is accepted"
11. Mergear a `gitlab/main`
12. Post-merge (en local):
    ```
    git checkout main && git pull gitlab main
    git tag vX.Y.Z
    git push gitlab --tags
    git push origin main --tags
    git push origin --delete <nombre-de-rama>   # limpiar branch en GitHub
    ```
13. Build installer (si hubo bump):
    ```
    npm run build:win   # default. Usar build:mac / build:linux solo si se especifica
    ```

## Anti-patterns

- ❌ `feat: Add new feature` (capital A)
- ❌ `fix: Se arreglo el bug del scanner` (not English)
- ❌ `refactor: refactored the code to make it better` (vague, robotic)
- ❌ `docs: update — added section about — the thing` (em dashes)
- ❌ Bumping version without asking the user first
