# DevOps labs

## Students

- Ivan Grandi
- Christopher Dubois
- Antoine Cortial

## Labs

| Lab   | Topic                                         | Answers                            |
| ----- | --------------------------------------------- | ---------------------------------- |
| Lab 1 | Git and CI/CD                                 | [ANSWERS_LAB1.md](ANSWERS_LAB1.md) |
| Lab 2 | Containers and Kubernetes                     | [ANSWERS_LAB2.md](ANSWERS_LAB2.md) |
| Lab 3 | Infrastructure as Code with Terraform         | [ANSWERS_LAB3.md](ANSWERS_LAB3.md) |
| Lab 4 | Observability, alerting and incident response | [ANSWERS_LAB4.md](ANSWERS_LAB4.md) |

## Repository structure

| Path                                                           | Content                                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/`, `tests/`                                               | Express API (`/`, `/health`, `/metrics`, `/slow`, `/error`) and its Jest tests                   |
| `Dockerfile`                                                   | Container image of the API                                                                       |
| `.github/workflows/`                                           | CI pipeline (`ci.yml`) and Terraform pipeline (`terraform.yml`)                                  |
| `k8s/base/`, `k8s/overlays/`                                   | Kubernetes manifests with Kustomize (one overlay per environment: dev, staging, prod)            |
| `k8s/base/servicemonitor.yaml`, `k8s/base/prometheusrule.yaml` | Prometheus scrape configuration and `HighErrorRate` alert                                        |
| `k8s/rbac/`, `k8s/audit/`                                      | Read-only RBAC role and audit policy                                                             |
| `infra/`                                                       | Terraform code (quickstart, `webapp` module, dev and staging environments, preview environments) |
| `monitoring/dashboards/`                                       | Grafana dashboard with the golden signals                                                        |
| `docs/`                                                        | Runbook, postmortem and screenshots                                                              |

## How to replicate the project

The commands below are written for a terminal like Git Bash. Unless a step says otherwise, they are run from the root of the repository.

### Prerequisites

Install the following tools:

- Node.js 22
- Docker Desktop (it must be running for every step below except step 1)
- kind
- kubectl
- Helm
- Terraform

On Windows, they can all be installed with winget:

```bash
winget install OpenJS.NodeJS.LTS Docker.DockerDesktop Kubernetes.kind Kubernetes.kubectl Helm.Helm Hashicorp.Terraform
```

To pull the application image from GitHub Container Registry (GHCR), you also need a GitHub personal access token with the `read:packages` scope.

### 1. Run the application locally

```bash
npm ci
npm test
npm start
```

The API listens on http://localhost:3000. You can test it with:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/metrics
curl http://localhost:3000/slow
curl http://localhost:3000/error
```

### 2. Build and run the container

```bash
docker build -t myapp .
docker run --rm -p 3000:3000 myapp
```

### 3. CI/CD pipeline

The CI pipeline runs automatically on GitHub, so there is nothing to run by hand:

- **`ci.yml`:** on every pull request, it installs the dependencies and runs the tests. On `main`, it also builds the image and publishes it to `ghcr.io/ivangrandi/devops-project-26-27`, tagged with the commit SHA.
- **`terraform.yml`:** on pull requests that change `infra/`, it runs `terraform fmt`, `terraform validate`, `terraform plan` for dev and staging, and a Checkov security scan. It never runs `apply`.

### 4. Deploy to Kubernetes

Create a local cluster and the namespaces:

```bash
kind create cluster --name devops-lab
kubectl create namespace dev
kubectl create namespace staging
kubectl create namespace prod
```

In each namespace, create the ConfigMap, the Secret and the GHCR pull secret used by the Deployment. The example below is for `dev`; repeat it for `staging` and `prod`, changing `APP_ENV` and `-n`:

```bash
kubectl create configmap myapp-config --from-literal=APP_ENV=dev -n dev
kubectl create secret generic myapp-secret --from-literal=API_KEY=changeme -n dev
kubectl create secret docker-registry ghcr-secret --docker-server=ghcr.io \
  --docker-username=<your-github-username> --docker-password=<your-token> -n dev
```

Deploy the application with Kustomize:

```bash
kubectl apply -k k8s/overlays/dev
kubectl apply -k k8s/overlays/staging
kubectl apply -k k8s/overlays/prod
kubectl get pods -A
```

Access the application in `dev`:

```bash
kubectl port-forward -n dev svc/myapp 8080:80
curl http://localhost:8080/health
```

### 5. Infrastructure as Code with Terraform

**Quickstart:** creates an nginx container on port 8082.

```bash
terraform -chdir=infra/quickstart init
terraform -chdir=infra/quickstart apply
curl http://localhost:8082
```

**Dev and staging environments:** both use the `webapp` module, with nginx on port 8083 (dev) and 8084 (staging).

```bash
terraform -chdir=infra/envs/dev init
terraform -chdir=infra/envs/dev apply "-var-file=dev.tfvars"

terraform -chdir=infra/envs/staging init
terraform -chdir=infra/envs/staging apply "-var-file=staging.tfvars"
```

The dev environment stores its state in `C:/terraform-mock-back/dev/` to simulate a remote backend. On macOS or Linux, change the `path` of the `backend "local"` block in `infra/envs/dev/main.tf` before running `init`.

**Preview environments:** create a `pr-<number>` namespace with the application. Use one workspace per pull request:

```bash
terraform -chdir=infra/preview init
terraform -chdir=infra/preview workspace new pr-42
terraform -chdir=infra/preview apply -var="pr_number=42" -var="image=ghcr.io/ivangrandi/devops-project-26-27:<commit-sha>"
```

### 6. Monitoring and alerting

The application in `dev` must run an image that includes `/metrics`.

Install the Prometheus, Grafana and Alertmanager stack with Helm. The release name must be `monitoring`, because the ServiceMonitor and the PrometheusRule select it with the label `release: monitoring`:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
kubectl create namespace monitoring
helm install monitoring prometheus-community/kube-prometheus-stack -n monitoring
kubectl get pods -n monitoring
```

Apply the scrape configuration and the alert rule:

```bash
kubectl apply -f k8s/base/servicemonitor.yaml
kubectl apply -f k8s/base/prometheusrule.yaml
```

Open Prometheus and Grafana (one terminal each):

```bash
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090
kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
```

- **Prometheus:** http://localhost:9090. The `myapp` target should be UP in Status > Targets, and `HighErrorRate` should be listed in Alerts.
- **Grafana:** http://localhost:3001, user `admin`. To get the password:

  ```bash
  # Git Bash / Linux / macOS
  kubectl get secret monitoring-grafana -n monitoring -o jsonpath="{.data.admin-password}" | base64 -d; echo
  ```

  ```powershell
  # PowerShell
  $p = kubectl get secret monitoring-grafana -n monitoring -o jsonpath="{.data.admin-password}"; [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p))
  ```

  Then import the dashboard: Dashboards > New > Import, upload `monitoring/dashboards/myapp-golden-signals.json` and select the Prometheus data source.

To see the alert fire, generate errors through a port-forward to the application (`kubectl port-forward -n dev svc/myapp 8080:80`):

```bash
while true; do curl -s http://localhost:8080/error > /dev/null; done
```

After about 3 minutes, `HighErrorRate` goes to Firing. The steps to handle it are in the [runbook](docs/runbook.md), and the incident we simulated is described in the [postmortem](docs/postmortem.md).

### 7. Clean up

```bash
terraform -chdir=infra/quickstart destroy
terraform -chdir=infra/envs/dev destroy "-var-file=dev.tfvars"
terraform -chdir=infra/envs/staging destroy "-var-file=staging.tfvars"
kind delete cluster --name devops-lab
```
