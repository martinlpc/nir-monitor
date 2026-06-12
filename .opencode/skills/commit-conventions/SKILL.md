---
name: commit-conventions
description: Git commit conventions for nir-monitor — conventional commits, English only, human language
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

## Anti-patterns

- ❌ `feat: Add new feature` (capital A)
- ❌ `fix: Se arreglo el bug del scanner` (not English)
- ❌ `refactor: refactored the code to make it better` (vague, robotic)
- ❌ `docs: update — added section about — the thing` (em dashes)
