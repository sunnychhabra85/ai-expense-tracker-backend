# AWS Load Balancer Controller Terraform Module

This module provisions the AWS Load Balancer Controller for Amazon EKS, including:

- EKS OIDC identity provider
- IAM role and policy for the ALB controller
- Helm chart installation of AWS Load Balancer Controller

## Features

- **Automatic OIDC Setup**: Creates OIDC provider for EKS cluster authentication
- **IAM Integration**: Provisions IAM role with least-privilege policy
- **Helm Deployment**: Optionally installs ALB controller via Helm
- **Flexible Configuration**: Can manage only IAM resources or full deployment

## Usage

### Full Installation (Recommended)

```hcl
module "alb_controller" {
  source = "./modules/alb-controller"

  project_name            = "finance-platform"
  environment             = "dev"
  cluster_name            = module.eks.cluster_name
  cluster_oidc_issuer_url = module.eks.cluster_oidc_issuer_url
  vpc_id                  = module.network.vpc_id
  create_oidc_provider    = true
  install_alb_controller  = true
  tags                    = local.common_tags
}
```

### IAM Only (Manual Helm Installation)

If you prefer to install ALB controller manually or via other tooling:

```hcl
module "alb_controller" {
  source = "./modules/alb-controller"

  project_name            = "finance-platform"
  environment             = "dev"
  cluster_name            = module.eks.cluster_name
  cluster_oidc_issuer_url = module.eks.cluster_oidc_issuer_url
  vpc_id                  = module.network.vpc_id
  create_oidc_provider    = true
  install_alb_controller  = false  # Skip Helm installation
  tags                    = local.common_tags
}
```

Then install manually:
```bash
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=<cluster-name> \
  --set serviceAccount.create=true \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=<role-arn> \
  --set vpcId=<vpc-id>
```

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|----------|
| project_name | Project name | string | - | yes |
| environment | Environment name | string | - | yes |
| cluster_name | EKS cluster name | string | - | yes |
| cluster_oidc_issuer_url | OIDC issuer URL from EKS | string | - | yes |
| vpc_id | VPC ID where cluster is deployed | string | - | yes |
| create_oidc_provider | Create OIDC provider | bool | true | no |
| install_alb_controller | Install via Helm | bool | true | no |
| alb_controller_version | Helm chart version | string | "1.7.1" | no |

## Outputs

| Name | Description |
|------|-------------|
| alb_controller_role_arn | IAM role ARN for ALB controller |
| alb_controller_policy_arn | IAM policy ARN |
| oidc_provider_arn | OIDC provider ARN |

## Prerequisites

1. **EKS Cluster**: Must have OIDC identity provider enabled
2. **Helm Provider**: Configured with EKS cluster credentials
3. **AWS CLI**: Available in PATH for Helm provider authentication

## Cost Impact

- **IAM Resources**: Free
- **Application Load Balancer**: ~$16-20/month per ALB (~$0.0225/hour + data transfer)
- **Helm Controller Pods**: Runs on existing EKS nodes

## Notes

- The IAM policy (`alb-controller-iam-policy.json`) is based on AWS Load Balancer Controller v3.1.0
- Update the policy file if upgrading to newer controller versions
- OIDC thumbprint is automatically retrieved from the cluster

## Troubleshooting

### OIDC Provider Already Exists

If you manually created the OIDC provider:

```hcl
module "alb_controller" {
  create_oidc_provider = false
  oidc_provider_arn    = "arn:aws:iam::ACCOUNT:oidc-provider/oidc.eks..."
}
```

### Controller Pods Not Starting

Check IAM role trust policy and verify OIDC provider ARN matches the federated principal.

### ALB Not Creating

1. Verify controller pods are running: `kubectl get pods -n kube-system`
2. Check logs: `kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller`
3. Ensure ingress has correct annotations (see ingress.yaml)
