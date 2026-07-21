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
chore: bump to X.Y.Z and update changelog/manual/readme
```

## Release workflow

### Flujo completo (GitLab + GitHub mirror)

El desarrollo se organiza con GitLab como repositorio primario (código + issues)
y GitHub como mirror profesional.

#### 1. Rama

```
git checkout -b <tipo>/<descripcion>
```

- Con issue de GitLab: `fix/1-disable-load-during-session`
- Sin issue: `feat/locations-indec-json`, `chore/release-workflow`

#### 2. Commits

Convencionales en inglés, imperativo. **Siempre consultar al usuario antes de
committear**, especialmente si el cambio requiere testeo previo.

#### 2.5. Push

```
git push gitlab <tipo>/<descripcion>
```

La rama se pusha a **gitlab** (repo primario), no a origin (mirror).

#### 3. MR summary

Una vez finalizado el issue o tarea, y solo cuando el usuario lo indique,
generar un sumario con el contenido para rellenar el MR en la web:

```
## Description
<explicación del cambio>

## Changelog
- vX.Y.Z (<tipo>)
- closes #<issue>
```

El usuario crea y mergea el MR manualmente en GitLab.

#### 4. Post-merge

Cuando el usuario indique que ya mergeó:

```
git checkout main && git pull gitlab main
```

Luego **sugerir** si corresponde o no version bump, explicando el porqué.
Esperar confirmación del usuario.

#### 5. Bump — propuesta

Si el usuario confirma el bump, mostrar el detalle de los cambios que se van a
hacer (archivos, líneas, versiones) y esperar confirmación final.

#### 6. Bump — ejecución

Confirmado el bump, ejecutar en orden:

1. Actualizar `"version"` en `package.json`
2. Actualizar badge en `README.md`
3. Actualizar `docs/manual.html`:
   - **Portada y footer:** versión SIEMPRE (debe coincidir con `package.json`)
   - **Contenido:** solo si los cambios afectan flujo de conexión, parámetros de
     captura, comportamiento de sesión, formatos de exportación, configuración de
     mapa o modo simulación
4. `npm run changelog` — regenera CHANGELOG.md
5. Commit: `chore: bump to X.Y.Z and update changelog/manual/readme`

#### 7. Tags

```
git tag vX.Y.Z
git push gitlab vX.Y.Z
```

#### 8. Mirror a GitHub

```
git push origin main
git push origin vX.Y.Z
```

## Anti-patterns

- ❌ `feat: Add new feature` (capital A)
- ❌ `fix: Se arreglo el bug del scanner` (not English)
- ❌ `refactor: refactored the code to make it better` (vague, robotic)
- ❌ `docs: update — added section about — the thing` (em dashes)
- ❌ Bumping version without asking the user first
