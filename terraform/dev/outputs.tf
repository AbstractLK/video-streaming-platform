output "eks_cluster_name" {
  value = aws_eks_cluster.main.name
}

output "ecr_registry" {
  value = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
}

output "frontend_bucket" {
  value = aws_s3_bucket.frontend.bucket
}

output "media_bucket" {
  value = aws_s3_bucket.media.bucket
}

output "frontend_cloudfront_domain" {
  value = aws_cloudfront_distribution.frontend.domain_name
}

output "media_cloudfront_domain" {
  value = aws_cloudfront_distribution.media.domain_name
}

output "frontend_cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.frontend.id
}

output "sqs_queue_url" {
  value = aws_sqs_queue.processing.url
}

output "upload_processing_irsa_role_arn" {
  value = aws_iam_role.upload_processing_irsa.arn
}

output "streaming_irsa_role_arn" {
  value = aws_iam_role.streaming_irsa.arn
}

output "fluent_bit_irsa_role_arn" {
  value = aws_iam_role.fluent_bit_irsa.arn
}

