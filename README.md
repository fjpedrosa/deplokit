# deplokit

> Zero-downtime Docker Compose deployments via CLI

[![npm version](https://img.shields.io/npm/v/@fjpedrosa/deploy-toolkit.svg)](https://www.npmjs.com/package/@fjpedrosa/deploy-toolkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

## What is Deplokit?

Deplokit is a CLI tool that simplifies deploying Docker Compose projects to local environments or remote VPS servers. It handles the entire deployment pipeline: syncing files via rsync, building Docker images, running database migrations, and verifying service health.

Whether you're deploying a single API service or a complete monorepo stack with multiple workers, Deplokit manages it all through a simple configuration file. It provides zero-downtime deployments by leveraging Docker Compose health checks, keeping old containers running until new ones are verified healthy.

**Key benefits:**
- Deploy with a single command instead of complex shell scripts
- Zero-downtime rolling updates with automatic health verification
- Track deployment history and rollback when needed
- Visual web dashboard for deployment management
- Works with any Docker Compose project (single apps or monorepos)

## Features

- **Zero-downtime deployments** - Rolling updates with `docker compose --wait`
- **Local & Remote support** - Deploy locally or to any VPS via SSH/rsync
- **Docker Compose integration** - Leverages your existing docker-compose.yml
- **Prisma migrations** - Automatically run database migrations
- **Health checks** - Verify services via Docker health status and HTTP endpoints
- **Deployment history** - SQLite-based tracking with rollback support
- **Web dashboard** - Visual interface for deployment management
- **Interactive CLI** - Menu-driven interface when no arguments provided
- **Monorepo support** - Workspace filtering for efficient syncs

## Installation

```bash
# Global install (recommended)
npm install -g @fjpedrosa/deploy-toolkit

# Or with bun
bun add -g @fjpedrosa/deploy-toolkit

# Or as a dev dependency in your project
npm install -D @fjpedrosa/deploy-toolkit
```

## Quick Start

### 1. Create configuration file

Create a `deploy-config.json` in your project root.

**Simple project:**

```json
{
  "project": {
    "name": "my-api",
    "domain": "api.example.com"
  },
  "deployment": {
    "type": "remote",
    "path": "/opt/apps/my-api",
    "vps_ip": "123.45.67.89",
    "ssh_user": "deploy"
  },
  "services": {
    "api": true
  },
  "paths": {
    "backend": ".",
    "dockerCompose": "./docker-compose.yml"
  }
}
```

**Monorepo:**

```json
{
  "project": {
    "name": "my-app",
    "domain": "myapp.com"
  },
  "deployment": {
    "type": "remote",
    "path": "/opt/apps/my-app",
    "vps_ip": "123.45.67.89",
    "ssh_user": "deploy",
    "ssh_key": "~/.ssh/deploy_key"
  },
  "services": {
    "api": true,
    "pdf_worker": {
      "enabled": true,
      "dockerName": "my-app-pdf-worker",
      "healthEndpoint": "/health"
    },
    "email_worker": false
  },
  "paths": {
    "frontend": "packages/frontend",
    "backend": "packages/backend",
    "shared": "packages/shared",
    "prisma": "packages/shared/prisma",
    "dockerCompose": "packages/backend/docker-compose.yml"
  }
}
```

### 2. Deploy

```bash
# Interactive menu
deplokit

# Or deploy everything
deplokit all

# Or deploy specific components
deplokit backend
deplokit service api
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `deplokit` | Interactive menu |
| `deplokit all` | Full deploy (backend + frontend) |
| `deplokit backend` | Deploy backend services |
| `deplokit frontend` | Deploy frontend only |
| `deplokit service <name>` | Deploy a specific service |
| `deplokit migrations` | Run Prisma migrations only |
| `deplokit status` | Show container status |
| `deplokit health` | Run health checks |
| `deplokit history` | View deployment history |
| `deplokit stats` | Show deployment statistics |
| `deplokit rollback` | Rollback to previous deployment |
| `deplokit dashboard` | Start web dashboard |
| `deplokit version` | Show deployed version on VPS |
| `deplokit services` | List available services |

## Command Options

```bash
# Specify environment
deplokit backend --env production
deplokit backend -e stage

# Skip steps
deplokit all --skip-migrations
deplokit service api --skip-health-check
deplokit backend --skip-validations

# Dashboard options
deplokit dashboard --port 4200
deplokit dashboard --no-open

# History options
deplokit history --limit 20
deplokit history --env production

# Rollback options
deplokit rollback --steps 2
```

## Configuration

### Project

```json
{
  "project": {
    "name": "my-app",
    "domain": "myapp.com"
  }
}
```

### Deployment

**Remote deployment (VPS):**
```json
{
  "deployment": {
    "type": "remote",
    "path": "/opt/apps/my-app",
    "vps_ip": "123.45.67.89",
    "ssh_user": "deploy",
    "ssh_key": "~/.ssh/deploy_key"
  }
}
```

**Local deployment:**
```json
{
  "deployment": {
    "type": "local",
    "path": "."
  }
}
```

### Services

Services can be defined as boolean or object:

```json
{
  "services": {
    "api": true,
    "worker": {
      "enabled": true,
      "dockerName": "custom-docker-name",
      "healthEndpoint": "/health"
    },
    "disabled_service": false
  }
}
```

### Paths

Customize paths for your project structure:

```json
{
  "paths": {
    "frontend": "packages/frontend",
    "backend": "packages/backend",
    "shared": "packages/shared",
    "prisma": "packages/shared/prisma",
    "dockerCompose": "packages/backend/docker-compose.yml"
  }
}
```

For single-folder projects, use:

```json
{
  "paths": {
    "backend": ".",
    "dockerCompose": "./docker-compose.yml"
  }
}
```

## Programmatic Usage

```typescript
import {
  deployBackend,
  deployService,
  loadDeployConfig,
  runHealthCheck,
} from '@fjpedrosa/deploy-toolkit';

// Deploy backend
await deployBackend({ env: 'production' });

// Deploy specific service
await deployService('api', { env: 'production' });

// Load config
const config = loadDeployConfig();

// Run health check
await runHealthCheck(config);
```

## Requirements

- **Runtime**: Node.js 18+ or Bun 1.0+
- **Docker**: Docker Engine + Docker Compose v2
- **SSH**: SSH access to VPS (for remote deployments)
- **Git**: For commit tracking in deployment history

## Documentation

Full documentation coming soon at [deplokit.dev](https://deplokit.dev)

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT
