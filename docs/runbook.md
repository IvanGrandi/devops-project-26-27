# Runbook: HighErrorRate

- **Alert**: `HighErrorRate`
- **Severity**: critical
- **Rule**: [k8s/base/prometheusrule.yaml](../k8s/base/prometheusrule.yaml)
- **Fires when**: more than 10% of requests return a 5xx error for 2 minutes

```promql
sum(rate(http_requests_total{status=~"5.."}[5m]))
  / sum(rate(http_requests_total[5m])) > 0.10
```

## What it means

This alert means that users are getting errors. More than 1 request out of 10 fails with a server error.
The most common cause is a bad deployment like a new image with a bug, but it can also be a crashing pod or a missing dependency.

## 1. Triage

Open Prometheus:

```bash
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090
```

On http://localhost:9090, run these queries:

- Error rate (same as the alert):
  ```promql
  sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))
  ```
- Which route is failing:
  ```promql
  sum by (route) (rate(http_requests_total{status=~"5.."}[5m]))
  ```

If the errors only come from `route="/error"`, it is the test endpoint (it fails 30% of the time on purpose), not a real incident.

You can also check the Grafana dashboard to see when the errors started.

Check if there was a recent deployment:

```bash
kubectl rollout history deployment/myapp -n dev
kubectl get deployment myapp -n dev -o jsonpath='{.spec.template.spec.containers[0].image}'
```

If the errors started right after a new revision, the new version is the most likely cause.

## 2. Mitigate

Mitigate first, find the root cause later.

**If a recent deployment caused it**: roll back to the previous version.

```bash
kubectl rollout undo deployment/myapp -n dev
kubectl rollout status deployment/myapp -n dev
```

To go back to a specific revision: `kubectl rollout undo deployment/myapp -n dev --to-revision=<n>`.

## 3. Find the root cause

Check the pods:

```bash
kubectl get pods -n dev
kubectl describe pod -n dev <pod-name>
```

Check the error logs (the app writes JSON logs with `"level":"error"`):

```bash
kubectl logs -n dev deploy/myapp --tail=100 | grep '"level":"error"'

kubectl logs -n dev <pod-name> --previous
```

If the cause was a bad image, fix the code on a new branch and let the CI test it before deploying again.

If the pods are crashing for another reason: read the logs and the events, fix the cause, then restart:

```bash
kubectl rollout restart deployment/myapp -n dev
```

## 4. Check that it is fixed

- The error rate query goes back under 0.10.
- The alert goes back to **Inactive** in Prometheus > Alerts (it can take a few minutes because of the `[5m]` window).
- `kubectl get pods -n dev` shows all pods `Running` with no new restarts.

## 5. After the incident

- Write a blameless postmortem in [docs/postmortem.md](postmortem.md) that explains the timeline, root cause, what we did, how to avoid it next time.
