# Video Streaming Platform

DevOps-focused, portfolio-realistic Netflix-like platform using AWS, EKS, Helm, Argo CD, Jenkins, Terraform, SQS, S3, CloudFront, CloudWatch Logs, Prometheus, Grafana, and Alertmanager.

## Architecture

- Frontend: React static site deployed to S3 and served by CloudFront.
- Backend: 5 Node.js + Express microservices on EKS.
- Database: PostgreSQL running in Kubernetes as a StatefulSet.
- Media: S3 media bucket with `raw/`, `processed/`, and `thumbnails/` prefixes.
- Queue: SQS processing queue plus DLQ.
- GitOps: Argo CD watches Helm charts and applies Kubernetes state.
- CI: Jenkins runs locally with Docker Compose and a persistent volume.
- Infrastructure: Terraform is run locally and creates AWS resources.

## Services

| Service | Responsibility |
| --- | --- |
| Auth Service | Register, login, JWT issue/validate |
| User Service | Profile, favorites, watch history |
| Video Service | Metadata, listing, genre filter, search, processing status |
| Upload/Processing Service | Presigned uploads, SQS job publishing, FFmpeg worker |
| Streaming Service | JWT validation, video readiness check, playback manifest URL |

## S3 Media Layout

```text
s3://video-streaming-media-dev/
  raw/
    videos/
      <videoId>/original.mp4
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

## Repository Layout

```text
frontend/                 React frontend
services/                 Five Node.js microservices
terraform/dev/            Local Terraform AWS infrastructure
helm/apps/                App umbrella Helm chart
helm/platform/            Helm values for platform charts
argocd-apps/              Argo CD Application definitions
jenkins/                  Jenkins image and pipeline
docker-compose.jenkins.yml
```

## Local Jenkins

```powershell
docker compose -f docker-compose.jenkins.yml up -d --build
```

Jenkins state is stored in the `jenkins_home` Docker volume.

## Terraform

```powershell
cd terraform/dev
terraform init
terraform plan
terraform apply
```

Terraform creates AWS infrastructure only. Kubernetes workloads are deployed through Helm and Argo CD.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full deployment sequence.

## Argo CD Flow

1. Bootstrap Argo CD into the `argocd` namespace.
2. Apply the files in `argocd-apps/`.
3. Argo CD deploys NGINX Ingress, monitoring, logging, and the app Helm chart.
4. Jenkins builds images, pushes to ECR, updates `helm/apps/video-streaming-platform/values-dev.yaml`, and pushes that Git change.
5. Argo CD syncs the new image tags.

## Dev Defaults

- Namespace: `dev`
- EKS node group: 2 x `t3.small`
- App replicas: 1
- Kubernetes Secrets are used for app secrets only.
- IRSA is used for pod access to AWS resources.
- No RDS, AWS Secrets Manager, Loki, Kafka, payments, recommendations, or subtitles prefix.
