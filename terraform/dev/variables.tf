variable "aws_region" {
  type        = string
  description = "AWS region for the dev environment."
  default     = "ap-southeast-1"
}

variable "project_name" {
  type        = string
  description = "Project name used for resource naming."
  default     = "video-streaming"
}

variable "environment" {
  type        = string
  description = "Single environment for this project."
  default     = "dev"
}

variable "github_repo_url" {
  type        = string
  description = "GitHub repository URL used in Argo CD manifests."
  default     = "GITHUB_REPO_URL"
}

variable "create_nat_gateway" {
  type        = bool
  description = "Create a NAT gateway for private EKS worker subnets."
  default     = true
}

variable "node_desired_size" {
  type        = number
  description = "Desired number of EKS worker nodes. Use 3 when running Argo CD, ingress, logging, and the full monitoring stack on t3.small."
  default     = 2
}

variable "node_min_size" {
  type        = number
  description = "Minimum number of EKS worker nodes."
  default     = 2
}

variable "node_max_size" {
  type        = number
  description = "Maximum number of EKS worker nodes."
  default     = 3
}

variable "service_names" {
  type        = list(string)
  description = "Microservice names that need ECR repositories."
  default = [
    "auth-service",
    "user-service",
    "video-service",
    "upload-processing-service",
    "streaming-service"
  ]
}
