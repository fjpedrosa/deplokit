# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Deploy Toolkit** - CLI for deploying monorepo projects (Next.js + Bun) with Docker to local or remote VPS.

**Stack**: TypeScript + Bun + Commander.js + Docker Compose
**Package Manager**: Bun

## Commands

```bash
bun run build           # TypeScript type checking (no emit)
bun run typecheck       # Alias for build

# Local development testing
bun run deploy          # Interactive menu
bun run deploy backend  # Test backend deploy
bun run deploy service api  # Test service deploy
bun run deploy status   # Show container status
```

## CLI Usage (after install)

```bash
deplokit                 # Interactive menu
deplokit all             # Deploy everything
deplokit backend         # Deploy backend only
deplokit service api     # Deploy specific service
deplokit dashboard       # Open web dashboard
deplokit version         # Show deployed version on VPS
deplokit status          # Show container status
deplokit history         # Show deployment history
deplokit rollback        # Rollback to previous deployment
```

## Publishing to npm

Publication is automated via GitHub Actions on tag push.

```bash
# 1. Update version in package.json
# 2. Commit and push changes
git add . && git commit -m "fix/feat: description" && git push

# 3. Create and push tag (triggers publish workflow)
git tag v1.0.X && git push origin v1.0.X
```

## Architecture

### Entry Points

- `src/cli.ts` - Commander.js CLI with all commands (all, backend, frontend, service, migrations, etc.)
- `src/index.ts` - Public API exports for programmatic usage

### Core Modules (`src/lib/`)

| Module | Responsibility |
|--------|----------------|
| `actions.ts` | High-level deploy orchestration (deployAll, deployBackend, deployService) |
| `config.ts` | Load/validate `deploy-config.json`, service normalization, path resolution |
| `ssh.ts` | Remote operations: rsync sync, SSH commands, dependency installation |
| `docker.ts` | Docker Compose operations (up, down, build, status) |
| `health-check.ts` | Container health verification, HTTP endpoint checks |
| `history.ts` | SQLite-based deployment history tracking |
| `prisma.ts` | Prisma migration execution (local and remote) |
| `validation.ts` | Pre-deploy validations (git, docker, SSH, env files) |
| `menu.ts` | Interactive CLI menu (inquirer) |
| `utils.ts` | Logging (chalk), spinners (ora), command execution (execa) |

### Deploy Flow

1. **Validation** - Check git status, Docker daemon, SSH connectivity
2. **Sync** (remote only) - rsync files to VPS with workspace filtering
3. **Build** - Docker Compose build images
4. **Deploy** - `docker compose up -d --wait` for zero-downtime rolling update
5. **Health Check** - Verify containers are healthy via Docker and HTTP endpoints
6. **History** - Record deployment in SQLite

### Configuration Schema

Projects using this toolkit define a `deploy-config.json`:

```typescript
interface DeployConfig {
  project: { name: string; domain: string };
  deployment: {
    type: 'local' | 'remote';
    path: string;
    vps_ip?: string;
    ssh_user?: string;
    ssh_key?: string;
  };
  services: {
    [name: string]: boolean | { enabled: boolean; dockerName?: string; healthEndpoint?: string };
  };
  paths?: { frontend?: string; backend?: string; shared?: string; prisma?: string };
}
```

### Service Name Normalization

Services are normalized from various formats to snake_case:
- `pdf-worker` → `pdf_worker`
- `pdfworker` → `pdf_worker`
- Docker service names are generated as `{project}-{service-kebab}` unless `dockerName` is specified

## Key Implementation Details

- **Zero-downtime deploys**: Uses `docker compose up -d --wait --wait-timeout 120` to keep old containers running until new ones are healthy
- **Workspace filtering**: Generates filtered `package.json` for rsync to only sync relevant monorepo packages
- **Deployment history**: SQLite database at `~/.deploy-toolkit/history.db`
- **No tests**: Project relies on integration testing against real monorepo projects

## Constraints

- **Backward compatibility**: Config schema changes must support existing `deploy-config.json` files
- **Test manually**: Always test changes against a real project (e.g., menu-diario) before publishing
- **Config file location**: Toolkit searches multiple paths for `deploy-config.json` (cwd, parent, packages/backend)
