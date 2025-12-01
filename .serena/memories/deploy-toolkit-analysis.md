# Deploy Toolkit Analysis: Backend vs Service Deploy Differences

## Problem Statement
After implementing blue-green deployment, `deploy-toolkit service api` fails with timeout in health checks while `deploy-toolkit backend` works correctly.

Error: `✖ Timeout waiting for containers to be healthy`

## Root Cause Analysis

### Key Difference 1: Docker Compose Up Command

**deployBackendRemote (WORKS):**
```typescript
// Line 277-281
await executeRemoteCommand(
  `cd ${config.deployment.path}/packages/backend && docker compose up -d --wait --wait-timeout 120`,
  sshOptions
);
```
- Uses `--wait` flag: Docker waits for containers to be healthy before returning
- Uses `--wait-timeout 120`: 120 second timeout built into Docker
- Result: Containers are guaranteed healthy BEFORE the command returns

**deployServiceRemote (FAILS):**
```typescript
// Line 513-516
await executeRemoteCommand(
  `cd ${config.deployment.path}/packages/backend && docker compose up -d --no-deps --build ${dockerServiceName}`,
  sshOptions
);
```
- NO `--wait` flag: Docker returns immediately after starting
- Containers may still be initializing when this command returns
- Result: `waitForContainers()` is called but containers haven't started yet

### Key Difference 2: Post-Deploy Waiting Strategy

**deployBackendRemote (WORKS):**
```typescript
// Line 277-281: docker compose up with --wait (waits in Docker)
await executeRemoteCommand(
  `cd ${config.deployment.path}/packages/backend && docker compose up -d --wait --wait-timeout 120`,
  sshOptions
);
// Line 290-291: Additional health check (after containers are healthy)
await runHealthCheck(config, { ... });
```
Sequential approach:
1. Docker ensures containers are healthy
2. Additional health check validates endpoints

**deployServiceRemote (FAILS):**
```typescript
// Line 513-516: docker compose up WITHOUT --wait (returns immediately)
await executeRemoteCommand(
  `cd ${config.deployment.path}/packages/backend && docker compose up -d --no-deps --build ${dockerServiceName}`,
  sshOptions
);
// Line 518-523: Manual waiting (happens immediately after)
await waitForContainers({
  remote: { ... },
});
```
Race condition:
1. `docker compose up -d` returns immediately (containers starting)
2. `waitForContainers()` starts immediately checking containers
3. Containers may not exist yet or may take too long to initialize
4. `waitForContainers()` times out after 180 seconds

### Key Difference 3: Container Status Checking Logic

**waitForContainers() function (Line 417-499 in health-check.ts):**

```typescript
while (Date.now() - startTime < maxWaitTime && !allHealthy) {
  let containers: ContainerStatus[] = [];

  if (remote) {
    // Gets containers from: docker compose ps
    const command = `cd ${remote.path}/packages/backend && docker compose ps ...`;
    const result = await executeRemoteCommand(command, remote.ssh);
    containers = result.stdout.trim().split('\n').map(...);
  }

  // Problem 1: May return 0 containers if they haven't started yet
  if (containers.length === 0) {
    await sleep(2000);
    continue;
  }

  // Problem 2: When deploying single service, ALL containers in docker-compose
  // are returned, not just the one being deployed
  const restartingCount = containers.filter(c => c.status.includes('Restarting')).length;
  if (restartingCount > 0) {
    // Waits for ALL restarting containers, even unrelated ones
    await sleep(3000);
    continue;
  }

  // Problem 3: Checks health of ALL containers, not just deployed service
  const healthChecks = await Promise.all(
    containers.map(async (c) => {
      const result = await checkContainerActualHealth(c.name, c.service, options);
      return { container: c.name, healthy: result.healthy, message: result.message };
    })
  );

  const healthyCount = healthChecks.filter(h => h.healthy).length;
  
  // Waits for ALL containers to be healthy, not just the deployed one
  if (healthyCount === containers.length) {
    allHealthy = true;
    break;
  }
}
```

**When deploying "api" service:**
- `docker compose ps` returns ALL containers (api, email-worker, image-worker, pdf-worker, scraper-worker, etc.)
- `waitForContainers()` waits for ALL of them to be healthy
- But only "api" was deployed, other containers may be in unknown state
- Timeout occurs waiting for other containers

### Key Difference 4: Scale and Complexity

**deployBackendRemote:**
- Deploys all backend services together
- All containers should start/be healthy
- Rolling update with `--wait` ensures they're coordinated

**deployServiceRemote:**
- Deploys single service with `--no-deps`
- But `waitForContainers()` checks ALL containers
- Creates mismatch between what was deployed and what's being verified

## Specific Issues Found

### Issue 1: Missing `--wait` Flag in Service Deploy
Location: `deployServiceRemote()` line 513-516
Impact: Containers not guaranteed healthy when waiting starts
Severity: CRITICAL - This is the main cause of timeouts

### Issue 2: Container Filtering in waitForContainers()
Location: `waitForContainers()` line 445-454
Impact: When deploying single service, waits for ALL containers
Problem: Only one service was deployed, but checking all of them
Severity: CRITICAL - Creates race conditions

### Issue 3: No Service Name Filtering in Health Checks
Location: `waitForContainers()` - no parameter for service name
Impact: Can't wait for specific service
Problem: Should filter containers to deployed service only
Severity: HIGH - Fundamental design issue for single-service deploy

### Issue 4: Config Parameter Not Used
Location: `waitForContainers()` accepts config parameter (line 417)
Implementation: Uses it for project name filtering (line 449-454)
Problem: Only filters by project name, not by deployed service
Severity: MEDIUM - Config logic incomplete

## Summary Table

| Aspect | Backend Deploy | Service Deploy |
|--------|---|---|
| Docker Command | `up -d --wait --wait-timeout 120` | `up -d --no-deps --build` |
| Wait Strategy | Built-in Docker `--wait` | Manual `waitForContainers()` |
| Containers Checked | All (coordinated start) | All (but only one deployed) |
| Health Check Scope | All services | All services |
| Service Name Passed to Wait | No (N/A - all deploying) | No (N/A - not implemented) |
| Timeout | 120s (Docker) + custom | 180s (hardcoded in waitForContainers) |
| Failure Mode | Unlikely - Docker handles | Common - race condition |

## Why deployBackendLocal Works

```typescript
// deployBackendLocal (Line 330-368)
await dockerComposeUp({
  cwd: backendPath,
  build: true,
  detached: true,
  forceRecreate: containerCount > 0,
});

await waitForContainers();  // No remote option, uses local docker
```

Works because:
1. Local `docker compose ps` is much faster
2. Race condition less likely with local Docker socket
3. All containers started together with `forceRecreate`
4. `waitForContainers()` has faster check intervals locally
