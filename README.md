# Video Streaming Platform

A DevOps-focused video streaming platform that demonstrates a production-style delivery workflow on AWS. The project combines a React frontend, Node.js microservices, Kubernetes workloads, Terraform-managed cloud infrastructure, GitOps deployment with Argo CD, and Jenkins-based CI/CD.

The application supports user authentication, video metadata management, browser uploads through presigned S3 URLs, asynchronous processing through SQS, HLS playback delivery through CloudFront, and service metrics for Prometheus/Grafana.

## Table of Contents

- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Services](#services)
- [Repository Structure](#repository-structure)
- [Infrastructure](#infrastructure)
- [CI/CD and GitOps Flow](#cicd-and-gitops-flow)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Verification](#verification)
- [Operations](#operations)
- [Teardown](#teardown)

## Architecture

```text
User
  |
  v
CloudFront Frontend Distribution
  |
  +-- S3 frontend bucket
  |
  +-- /api/* --> NGINX Ingress --> EKS services
                                  |
                                  +-- auth-service
                                  +-- user-service
                                  +-- video-service
                                  +-- upload-processing-service
                                  +-- streaming-service
                                  +-- PostgreSQL StatefulSet

Video upload flow:
Browser --> upload-processing-service --> S3 raw/
                                      --> SQS processing queue
                                      --> worker with FFmpeg
                                      --> S3 processed/hls/ and thumbnails/
                                      --> media CloudFront distribution
```

### Key Design Points

- Terraform provisions AWS infrastructure including VPC, EKS, ECR, S3, CloudFront, SQS, IAM, and IRSA roles.
- Helm defines Kubernetes resources for the application, PostgreSQL, service accounts, secrets, ingress, metrics, alerts, and storage.
- Argo CD watches this repository and reconciles platform and application manifests into the EKS cluster.
- Jenkins builds service images, scans them with Trivy, pushes images to ECR, updates Helm image tags in Git, and deploys the frontend to S3.
- Prometheus scrapes application and cluster metrics; Grafana provides dashboards; Fluent Bit ships logs to CloudWatch Logs.

## Technology Stack

| Area | Tools |
| --- | --- |
| Frontend | React 18, Vite, React Router, HLS.js |
| Backend | Node.js, Express, PostgreSQL, JWT, bcrypt |
| Media | Amazon S3, CloudFront, FFmpeg, HLS |
| Async Processing | Amazon SQS with dead-letter queue |
| Containers | Docker, Amazon ECR |
| Orchestration | Amazon EKS, Kubernetes, Helm |
| GitOps | Argo CD |
| CI/CD | Jenkins, Docker Compose, Trivy |
| Infrastructure | Terraform, AWS IAM, IRSA, VPC, EBS CSI |
| Observability | Prometheus, Grafana, Alertmanager, Fluent Bit, CloudWatch Logs |

## Services

| Service | Responsibility | Main Routes |
| --- | --- | --- |
| `auth-service` | Registration, login, logout, JWT validation | `/register`, `/login`, `/logout`, `/validate` |
| `user-service` | Profile, favorites, watch history | `/profile`, `/favorites`, `/watch-history` |
| `video-service` | Video metadata, catalog, search, status updates | `/`, `/search`, `/:id`, `/:id/status` |
| `upload-processing-service` | Presigned uploads, upload completion, SQS job publishing | `/presigned-url`, `/complete` |
| `streaming-service` | Playback authorization and HLS manifest URL generation | `/:videoId` |

Every service also exposes:

- `/health` for readiness checks.
- `/metrics` for Prometheus scraping.

## Repository Structure

```text
.
|-- frontend/                         React/Vite frontend
|-- services/                         Node.js microservices
|   |-- auth-service/
|   |-- user-service/
|   |-- video-service/
|   |-- upload-processing-service/
|   `-- streaming-service/
|-- terraform/dev/                    AWS infrastructure for the dev environment
|-- helm/apps/video-streaming-platform/
|                                      Application Helm chart
|-- helm/platform/                    Values for Argo CD, ingress, monitoring, logging
|-- argocd-apps/                      Argo CD Application manifests
|-- jenkins/                          Jenkins image and pipeline definition
|-- docs/DEPLOYMENT.md                Detailed deployment runbook
`-- docker-compose.jenkins.yml        Local Jenkins runtime
```

## Infrastructure

Terraform creates the AWS foundation for the dev environment:

- VPC with public and private subnets across two availability zones.
- EKS cluster and managed node group.
- EBS CSI driver and `gp3` storage support.
- ECR repositories for all backend services.
- S3 buckets for frontend static assets and media storage.
- CloudFront distributions for frontend delivery and processed media delivery.
- SQS processing queue and dead-letter queue.
- IAM roles and IRSA policies for upload processing, streaming, Fluent Bit, and EBS CSI.

Default environment values:

| Setting | Value |
| --- | --- |
| Environment | `dev` |
| AWS region | `ap-southeast-1` |
| Kubernetes namespace | `dev` |
| EKS instance type | `t3.small` |
| Default desired nodes | `2` |
| Recommended full-stack nodes | `3` or more for app + ingress + logging + monitoring |

## CI/CD and GitOps Flow

1. A code change is pushed to the repository.
2. Jenkins checks whether the change affects source code or pipeline files.
3. Backend services run syntax checks.
4. Docker images are built for all services.
5. Trivy scans images for high and critical vulnerabilities.
6. Images are pushed to Amazon ECR.
7. Jenkins updates `helm/apps/video-streaming-platform/values-dev.yaml` with the new image tag.
8. Jenkins commits and pushes the Helm value change.
9. Argo CD detects the Git change and syncs the EKS workloads.
10. The frontend is built and synced to the S3 frontend bucket.
11. Jenkins creates a CloudFront invalidation for the frontend distribution.

Jenkins intentionally does not apply backend Kubernetes resources directly. Backend deployment is handled through GitOps by Argo CD.

## Getting Started

### Prerequisites

- AWS CLI configured with permissions for EKS, ECR, S3, CloudFront, SQS, IAM, and VPC resources.
- Terraform.
- kubectl.
- Helm.
- Docker and Docker Compose.
- Node.js and npm.
- Jenkins credentials for AWS, Git, frontend bucket, and CloudFront distribution.

### Install Frontend Dependencies

```powershell
cd frontend
npm install
npm run build
```

For local frontend development:

```powershell
cd frontend
npm run dev
```

The frontend uses `VITE_API_BASE_URL` when provided. If it is not set, API requests default to `/api`.

### Check Backend Services

Run checks from each service directory:

```powershell
cd services/auth-service
npm install
npm run check
```

Repeat for:

- `services/user-service`
- `services/video-service`
- `services/upload-processing-service`
- `services/streaming-service`

## Deployment

For the complete deployment sequence, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### 1. Provision AWS Infrastructure

```powershell
cd terraform/dev
copy terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

After Terraform completes, copy the relevant outputs into:

- `helm/apps/video-streaming-platform/values-dev.yaml`
- `helm/platform/fluent-bit-values.yaml`
- Jenkins credentials
- Argo CD Application manifests if the repository URL changes

Important outputs include:

- ECR registry.
- Frontend S3 bucket.
- Frontend CloudFront distribution ID.
- Media CloudFront domain.
- SQS queue URL.
- IRSA role ARNs.

### 2. Configure kubeconfig

```powershell
aws eks update-kubeconfig --region ap-southeast-1 --name video-streaming-dev-eks
```

### 3. Bootstrap Argo CD

```powershell
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
kubectl create namespace argocd
helm upgrade --install argocd argo/argo-cd -n argocd -f helm/platform/argocd-values.yaml
kubectl apply -f argocd-apps/
```

Recommended first sync order:

1. `ingress-nginx-dev`
2. `monitoring-dev`
3. `logging-dev`
4. `video-streaming-platform-dev`

### 4. Run Jenkins Locally

```powershell
docker compose -f docker-compose.jenkins.yml up -d --build
```

Jenkins is available at:

```text
http://localhost:8080
```

Jenkins state is stored in the `jenkins_home` Docker volume.

Required Jenkins credentials:

| Credential ID | Purpose |
| --- | --- |
| `aws-region` | AWS region used by the pipeline |
| `aws-account-id` | AWS account ID for ECR registry generation |
| `frontend-bucket` | S3 bucket for frontend deployment |
| `frontend-cloudfront-distribution-id` | CloudFront distribution invalidated after frontend deploy |
| `aws-jenkins-creds` | AWS access keys for ECR, S3, and CloudFront operations |
| `github-pat` | Git credentials for committing Helm image tag updates |

## Verification

### Cluster Health

```powershell
kubectl get nodes
kubectl get pods -n dev
kubectl get pods -n ingress-nginx
kubectl get pods -n monitoring
kubectl get pods -n logging
```

### Application Flow

1. Open the frontend CloudFront URL.
2. Register or use the configured demo/admin account for the dev environment.
3. Upload an MP4 file from the admin upload workflow.
4. Confirm the upload service writes the original file to `raw/videos/<videoId>/original.mp4`.
5. Confirm an SQS message is created for processing.
6. Confirm the worker transcodes the video and writes HLS output under `processed/hls/<videoId>/`.
7. Refresh the catalog.
8. Select a video with status `ready` and verify HLS playback.

### Media Layout

```text
s3://<media-bucket>/
  raw/
    videos/
      <videoId>/
        original.mp4
  processed/
    hls/
      <videoId>/
        master.m3u8
        720p/
        480p/
  thumbnails/
    <videoId>/
      thumbnail.jpg
```

## Operations

### Grafana

Open Grafana locally:

```powershell
kubectl -n monitoring port-forward svc/monitoring-dev-grafana 3000:80
```

Then visit:

```text
http://localhost:3000
```

Default dev credentials are configured in `helm/platform/monitoring-values.yaml`. Rotate them before using this outside a local/dev environment.

Useful checks:

```promql
up{namespace="dev"}
process_cpu_user_seconds_total{namespace="dev"}
nodejs_eventloop_lag_seconds{namespace="dev"}
```

### Logs

Fluent Bit is configured through `helm/platform/fluent-bit-values.yaml` and ships Kubernetes logs to CloudWatch Logs using IRSA.

### Common Troubleshooting

If browser uploads fail, check:

- Frontend CloudFront has a `/api/*` behavior pointing to the NGINX Ingress load balancer.
- The media S3 bucket CORS policy allows browser `PUT` uploads.
- `values-dev.yaml` contains the correct Terraform media bucket output.
- The upload-processing service account has the correct IRSA role annotation.

If playback fails, check:

- The video status is `ready`.
- HLS files exist under `processed/hls/<videoId>/`.
- The media CloudFront distribution can access `processed/*`.
- The streaming service can validate the user session/JWT.

If pods are pending, check:

- Node capacity.
- PVC binding for PostgreSQL.
- `gp3` StorageClass availability.
- EBS CSI controller status in `kube-system`.


## Security Notes

- Values in `values-dev.yaml` are for development and demonstration only.
- Replace default credentials and JWT secrets before deploying to any shared or production-like environment.
- Prefer external secret management for real environments.
- Keep AWS credentials in Jenkins credentials, not in source control.
- Review S3 bucket policies, CloudFront origins, and IAM permissions before public exposure.

## License

