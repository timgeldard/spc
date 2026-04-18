# SPC Ops Runbook

## Secrets

The SPC app reads a small number of environment variables at startup. Only one
is sensitive today: `DATABRICKS_READINESS_TOKEN`, used by `/api/ready` to run a
`SELECT 1` probe against the SQL warehouse without relying on a signed-in user.

### Do not

- Do not set `DATABRICKS_READINESS_TOKEN` as a literal value in `app.yaml`,
  `app.template.yaml`, CI variables, or any file in the repo.
- Do not reuse a user PAT as the readiness token. The token should be tied to
  a service principal with `CAN_USE` on the SQL warehouse and nothing else.

### Do — canonical secret-scope pattern

1. **Create a scope** (one-time per workspace):
   ```bash
   databricks secrets create-scope spc-app --profile <profile>
   ```

2. **Grant the app's service principal READ** on the scope:
   ```bash
   databricks secrets put-acl spc-app <app-service-principal> READ --profile <profile>
   ```

3. **Write the token** (paste into the prompt, never pass on the command line):
   ```bash
   databricks secrets put-secret spc-app readiness_token --profile <profile>
   ```

4. **Reference the secret** in `app.template.yaml` (uncomment the block documented there):
   ```yaml
   - name: DATABRICKS_READINESS_TOKEN
     valueFrom: spc-app/readiness_token
   ```

5. **Re-render and deploy**:
   ```bash
   make deploy PROFILE=<profile>
   ```

6. **Verify**:
   ```bash
   curl -fsS https://<app-host>/api/ready
   # Expected: 200 OK with warehouse probe success
   ```

### Rotation

Rotate quarterly, or immediately after:
- A service principal is removed from the workspace.
- A staff member with READ on `spc-app` leaves the team.
- Any suspected leak (for example, an accidental paste into logs or a PR).

Rotation procedure:

1. Generate a new PAT for the service principal, minimum TTL that covers the
   rollout window plus a one-week grace.
2. `databricks secrets put-secret spc-app readiness_token --profile <profile>`.
3. Restart the app (or let the next `make deploy` roll it): the new value is
   read at process start. No app-side rotation logic is required.
4. Revoke the old PAT in the Databricks UI. Watch `/api/ready` for 5 minutes
   to confirm no requests are still authenticating with the old value.

### Verification — no plaintext secret should appear

Before every deploy, CI (or the engineer on a personal deploy) should run:

```bash
grep -RE 'DATABRICKS_READINESS_TOKEN\s*[:=]\s*[A-Za-z0-9]{10,}' app*.yaml databricks.yml || echo "OK"
```

This greps for any line that assigns a literal to the variable. A match means
a secret has leaked into a config file and the deploy must be aborted.

## Deployment preflight

`make deploy` already runs the following, in order:

1. `databricks current-user me` — fails fast if auth is wrong.
2. `npm run build` — ensures the frontend is fresh before upload.
3. `databricks bundle deploy` — pushes the app source and config.
4. Migrations 000–019 applied idempotently against the target catalog/schema.

If any migration fails, the app code is already deployed. Roll back by
reapplying the previous migration (each is idempotent and reversible via an
explicit `DROP` / `ALTER` in a follow-up script if needed).

## Incidents — where to look first

| Symptom | First check | Why |
|---|---|---|
| `/api/ready` returns 500 or 503 | `DATABRICKS_READINESS_TOKEN` scope + warehouse ACL | Secret missing or stale |
| 401 from SPC endpoints | `x-forwarded-access-token` header at the app proxy | Token passthrough broken |
| Unexpected rate-limit 429s | `backend/utils/rate_limit.py` defaults and endpoint limits | Recent limit changes |
| Charts show "Autocorrelation suspected" unexpectedly | Underlying process drift — not an app bug | Shewhart independence assumption violated |
| Capability shown as "Unstable" | WECO/Nelson rule fired in window — investigate the signal | Stability guard (Phase 1.2) |
| Scorecard column types look wrong | `gold_batch_quality_result_v` / `gold_batch_mass_balance_v` schema drift | Upstream contract (Phase 2.1) |
