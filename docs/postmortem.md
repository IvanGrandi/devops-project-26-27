# Postmortem: half of the requests on the root endpoint "/" failed after a manual deployment of a bugged version

## Summary and impact of the simulation

Ivan played the role of the saboteur and created a bugged image of the API. Christopher played the role of the responder, handled the incident and applied the correction. The simulation was run on a single machine, because doing it on different machines would have meant redoing the same steps on each one, since each machine can only use its own local cluster. A scenario where both could have used their own machines would be possible if we shared a cluster, for example on a cloud server.

This was a simulated incident in the dev namespace. The traffic came from a test pod that sent about 5 requests per second to the application.

On November 24, 2026, between 15:18 and 15:32 UTC (about 13 minutes), about half of the requests to the root endpoint "/" of the app in the dev namespace returned a 500 error.

- About 2,000 requests failed out of about 4,400 requests on the root endpoint "/" (around 47%).
- /health and /metrics kept working, so Kubernetes considered the pod healthy.
- The incident was detected by the HighErrorRate alert (severity critical) about 3.5 minutes after the deployment, and mitigated with a rollback.

## Timeline (UTC)

| Time     | Event                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 15:13:36 | A test pod starts sending traffic to the root endpoint "/" (about 5 requests per second)                                                   |
| 15:17:50 | The version of the app with the bug is deployed with kubectl set image. The image was built locally and did not go through the CI pipeline |
| 15:18:30 | First 500 errors on the root endpoint "/"                                                                                                  |
| 15:19:16 | HighErrorRate alert goes to Pending (error ratio above 10%)                                                                                |
| 15:21:16 | HighErrorRate alert goes to Firing (condition true for 2 minutes)                                                                          |
| ~15:25   | The alert is seen as Firing in Prometheus, then the error spike on the Grafana dashboard                                                   |
| 15:30    | Investigation with kubectl rollout history, the deployment image and kubectl logs                                                          |
| 15:31:06 | Error with the deployment was identified: the image with the bug created 500 errors on the root endpoint "/" in the logs                   |
| 15:31:09 | Rollback started with kubectl rollout undo (previous version redeployed)                                                                   |
| 15:31:22 | Rollback finished, image back to 12e238d                                                                                                   |
| 15:31:45 | Last 500 errors                                                                                                                            |
| 15:35:15 | HighErrorRate alert resolved                                                                                                               |
| 15:36:31 | Error ratio back to 0 on the dashboard                                                                                                     |

## Root cause and contributing factors

**Root cause:** during the simulation, we generated an image of a version of the API containing a bug in the root endpoint "/". It was designed to return a 500 error for about half of the requests. This image was built locally and deployed directly with kubectl set image, so it never went through the CI pipeline. It was executed on the same machine.

**Contributing factors:**

- Nothing in our process prevents a manual deployment to the cluster. Anyone with kubectl access can change the image.
- The readiness and liveness probes only check /health. Kubernetes considered the new pod healthy and finished the rollout.
- The dev environment has only 1 replica, so all the traffic went to the faulty version at once.
- There is no smoke test after a deployment to check the real routes of the application.
- The cluster was different from Git, as the repository still had the 12e238d tag while the cluster ran the image we created manually.

## What went well / what went poorly

**What went well:**

- The HighErrorRate alert fired about 3.5 minutes after the deployment, and the for: 2m clause did not delay the detection much.
- The dashboard with the golden signals helped to understand the problem. The error ratio went up while the traffic was stable and the p95 latency stayed flat, so it was a bug in the code and not an overload.
- The JSON logs clearly revealed the errors with the values: "level":"error", "path":"/", "status":500.
- The rollback from the runbook took about 15 seconds and the errors stopped right away.

**What went poorly:**

- About 10 minutes passed between the alert firing and the rollback. The Grafana and Prometheus pages were not refreshing automatically, so we first looked at old data. We had to press Ctrl + F5 to see the results.
- There were already several default alerts firing on our kind cluster even though nothing was broken. This noise made our alert harder to find at first glance.
- The alert took about 4 minutes to resolve after the fix because of the [5m] window in the query.
- The "Memory per pod" panel shows raw bytes, which is hard to read.

## Action items (hypothetical)

| Action                                                                                                                                                              | Owner       | Deadline   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| Add a smoke test step after the deployment in the pipeline: call the root endpoint "/" several times and run kubectl rollout undo automatically if there are errors | Christopher | 2026-12-01 |
| Only deploy images built by the CI (tagged with a commit SHA), and remove write access to the cluster for manual deployments (RBAC)                                 | Antoine     | 2026-12-08 |
| Use a canary release: deploy the new version to a small part of the traffic first and stop if the error ratio goes above 10%                                        | Ivan        | 2026-12-15 |
| Disable the default alerts that cannot work on kind (etcd, scheduler, controller-manager, kube-proxy) to reduce the noise                                           | Ivan        | 2026-12-01 |
| Set the dashboard auto-refresh to 10s by default, add deployment annotations, and show memory in bytes in a time series                                             | Christopher | 2026-12-01 |
| Always fill the change cause (kubernetes.io/change-cause annotation) when deploying                                                                                 | Antoine     | 2026-12-08 |
