# CLAUDE.md - Deploy Toolkit

Instrucciones para Claude Code al trabajar con este proyecto.

## Descripción

**Deploy Toolkit** - CLI para despliegue de proyectos monorepo Next.js + Bun con Docker.

**Stack**: TypeScript + Bun + Commander.js + Docker Compose
**Package Manager**: Bun

## Comandos

```bash
bun run build      # Verificar tipos TypeScript
bun run typecheck  # Alias para build
```

## Proceso de Publicación a npmjs

**IMPORTANTE**: La publicación se hace automáticamente via GitHub Actions al hacer push.

### Pasos para publicar una nueva versión:

1. **Hacer los cambios** en el código (`src/`)

2. **Incrementar versión** en `package.json`:
   ```json
   "version": "1.0.X"  // Incrementar X
   ```

3. **Commit y Push**:
   ```bash
   git add .
   git commit -m "fix/feat: descripción del cambio"
   git push
   ```

4. **Esperar** a que GitHub Action complete la publicación (~1-2 min)

5. **Actualizar en proyectos** que usen el toolkit:
   ```bash
   bun update @fjpedrosa/deploy-toolkit
   ```

### Versionado Semántico

- `1.0.X` - Patch: bug fixes, mejoras menores
- `1.X.0` - Minor: nuevas features compatibles
- `X.0.0` - Major: breaking changes

## Estructura del Proyecto

```
src/
├── cli.ts          # Entry point CLI (Commander.js)
├── index.ts        # Exports públicos
└── lib/
    ├── actions.ts      # Acciones de deploy (backend, frontend, service)
    ├── config.ts       # Carga y validación de deploy.config.ts
    ├── docker.ts       # Operaciones Docker (compose up/down, build)
    ├── health-check.ts # Health checks y validación de contenedores
    ├── history.ts      # Historial de deployments (SQLite)
    ├── migrations.ts   # Ejecución de migraciones Prisma
    ├── rsync.ts        # Sincronización de archivos via rsync
    ├── ssh.ts          # Comandos SSH remotos
    └── validations.ts  # Validaciones pre-deploy
```

## Archivos Clave

- `src/lib/actions.ts` - Lógica principal de deploy (deployBackendRemote, deployServiceRemote, etc.)
- `src/lib/health-check.ts` - Verificación de health de contenedores Docker
- `src/lib/config.ts` - Parsing del archivo deploy.config.ts del proyecto

## Restricciones

- **NO modificar** la estructura de `deploy.config.ts` sin actualizar documentación
- **Mantener compatibilidad** con versiones anteriores del config
- **Testear** cambios en proyecto real (menu-diario) antes de publicar
