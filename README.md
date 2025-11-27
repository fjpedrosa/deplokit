# @fjpedrosa/deploy-toolkit

Universal deployment toolkit for monorepo projects with Docker, SSH, and Prisma support.

## Features

- **Dynamic Service Configuration**: Define services in `deploy-config.json` and deploy any of them
- **Local & Remote Deployments**: Deploy locally with Docker Compose or remotely via SSH/rsync
- **Prisma Migrations**: Run database migrations as part of the deployment process
- **Health Checks**: Verify service health after deployment
- **Deployment History**: Track all deployments with SQLite-based history
- **Interactive Menu**: Use the interactive CLI menu for easy deployment management
- **Workspace Filtering**: Deploy only the necessary workspaces for faster sync

## Installation

```bash
# Using bun (recommended)
bun add -d @fjpedrosa/deploy-toolkit

# Using npm with GitHub Packages
npm install @fjpedrosa/deploy-toolkit --registry=https://npm.pkg.github.com
```

### Configure npm for GitHub Packages

Create or update your `~/.npmrc`:

```
@fjpedrosa:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

## Setup

1. Create a `deploy-config.json` in your project root:

```json
{
  "project": {
    "name": "my-project",
    "domain": "example.com"
  },
  "deployment": {
    "type": "remote",
    "path": "/opt/apps/my-project",
    "vps_ip": "123.45.67.89",
    "ssh_user": "deploy"
  },
  "services": {
    "api": true,
    "pdf_worker": true,
    "email_worker": false
  }
}
```

See `templates/deploy-config.example.json` for a complete example.

2. Add scripts to your `package.json`:

```json
{
  "scripts": {
    "deploy": "deploy",
    "deploy:backend": "deploy backend",
    "deploy:api": "deploy service api",
    "deploy:status": "deploy status",
    "deploy:health": "deploy health-check"
  }
}
```

## Usage

### CLI Commands

```bash
# Interactive menu (no arguments)
bun run deploy

# Deploy all (backend + frontend)
bun run deploy all

# Deploy backend only
bun run deploy backend

# Deploy a specific service
bun run deploy service api
bun run deploy service pdf-worker

# Run migrations only
bun run deploy migrations

# Health check
bun run deploy health-check

# Show container status
bun run deploy status

# View deployment history
bun run deploy history

# View statistics
bun run deploy stats

# List available services
bun run deploy services
```

### Options

```bash
# Specify environment
bun run deploy backend --env production
bun run deploy backend -e stage

# Skip validations
bun run deploy backend --skip-validations

# Skip health check
bun run deploy service api --skip-health-check

# Skip migrations
bun run deploy all --skip-migrations
```

### Programmatic Usage

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

## Configuration

### Services

Services can be defined as boolean or object:

```json
{
  "services": {
    "api": true,
    "pdf_worker": {
      "enabled": true,
      "dockerName": "custom-docker-service-name",
      "healthEndpoint": "/health"
    }
  }
}
```

### Paths

Customize paths for your monorepo structure:

```json
{
  "paths": {
    "frontend": "packages/frontend",
    "backend": "packages/backend",
    "shared": "packages/shared",
    "prisma": "packages/shared/database/prisma",
    "dockerCompose": "packages/backend/docker-compose.yml"
  }
}
```

### Remote Deployment

For remote deployments via SSH:

```json
{
  "deployment": {
    "type": "remote",
    "path": "/opt/apps/my-project",
    "vps_ip": "123.45.67.89",
    "ssh_user": "deploy",
    "ssh_key": "~/.ssh/deploy_key"
  }
}
```

### Local Deployment

For local Docker Compose deployments:

```json
{
  "deployment": {
    "type": "local",
    "path": "."
  }
}
```

## Requirements

- Bun 1.0+
- Docker & Docker Compose
- SSH access (for remote deployments)
- Git (for commit tracking)

## License

MIT
# deplokit
