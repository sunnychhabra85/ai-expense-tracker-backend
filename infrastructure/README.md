# DevOps Setup (Learning-Friendly, Production-Ready Path)

This directory includes:
- `terraform/`: reusable AWS infra modules (VPC, subnets, SGs, ECR, EKS)
- `k8s/`: Kubernetes manifests (deployments, services, configmaps, secrets, HPA, ingress)

## Cost-aware defaults
- EKS node group defaults to `t3.small`, min/desired 1 node.
- HPA starts at 1 replica and scales to 3.
- ECR lifecycle keeps latest 30 images.

## CI/CD flow
GitHub Actions implements:
1. install
2. test
3. build
4. push
5. deploy

Images are tagged with both commit SHA and `latest`.
