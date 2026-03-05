# Step-by-Step DevOps Implementation Guide (AWS + EKS + ECR + GitHub Actions)

This guide explains **exactly how to implement and run** the DevOps setup added in this repository.
It is written for learning first, with low-cost defaults and a path to production.

---

## 0) What you are deploying

You will set up:
1. Docker images for all services
2. AWS infrastructure using Terraform (VPC, subnets, SGs, ECR, EKS)
3. Kubernetes manifests (deployments, services, probes, HPA, ingress)
4. AWS Load Balancer Controller for ALB ingress
5. GitHub Actions CI/CD pipeline (install → test → build → push → deploy)

---

## 1) Prerequisites

Install locally:
- AWS CLI v2
- kubectl
- Terraform >= 1.6
- Docker
- Node.js 20 + npm

Verify:
```bash
aws --version
kubectl version --client
terraform version
docker --version
node --version
npm --version
```

---

## 2) AWS account bootstrap (one-time)

### 2.1 Configure AWS profile
```bash
aws configure
# region: ap-south-1 (or your preferred region)
```

### 2.2 Create Terraform backend resources
(Recommended so your state is not local.)
```bash
aws s3 mb s3://finance-platform-terraform-state

aws dynamodb create-table \
  --table-name terraform-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

---

## 3) Build and test locally first

```bash
npm ci
npm test
```

Build one sample image:
```bash
docker build \
  --build-arg SERVICE_NAME=auth-service \
  --build-arg PORT=3001 \
  -f apps/auth-service/Dockerfile \
  -t auth-service:local .
```

Run quick container health check:
```bash
docker run --rm -p 3001:3001 auth-service:local
# then in another terminal:
curl http://localhost:3001/api/v1/health
```

---

## 4) Provision infrastructure with Terraform

### 4.1 Create tfvars
```bash
cd infrastructure/terraform
cp environments/dev/terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` if needed (region, name, instance sizes).

### 4.2 Initialize and apply
```bash
terraform init
terraform plan -out tfplan
terraform apply tfplan
```

### 4.3 Capture outputs
```bash
terraform output
```

You will use:
- EKS cluster name
- ECR repo URLs

---

## 5) Connect kubectl to EKS

```bash
aws eks update-kubeconfig --name finance-platform-dev --region ap-south-1
kubectl get nodes
```

---

## 6) Install AWS Load Balancer Controller (required for ALB Ingress)

> The manifest includes a ServiceAccount placeholder annotation. Replace `<ACCOUNT_ID>` and role name properly.

### 6.1 Create IAM policy
```bash
curl -o iam_policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json
aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://iam_policy.json
```

### 6.2 Create IAM role for service account (IRSA)
Use `eksctl` (simplest for learners):
```bash
eksctl create iamserviceaccount \
  --cluster finance-platform-dev \
  --namespace kube-system \
  --name aws-load-balancer-controller \
  --role-name finance-platform-dev-alb-controller \
  --attach-policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/AWSLoadBalancerControllerIAMPolicy \
  --approve
```

### 6.3 Install controller via Helm
```bash
helm repo add eks https://aws.github.io/eks-charts
helm repo update

helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=finance-platform-dev \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=ap-south-1 \
  --set vpcId=<VPC_ID>
```

Validate:
```bash
kubectl get pods -n kube-system | grep aws-load-balancer-controller
```

---

## 7) Push images to ECR

### 7.1 Login
```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=ap-south-1
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
```

### 7.2 Build and push (for each service)
Example for auth-service:
```bash
GIT_SHA=$(git rev-parse --short HEAD)
REGISTRY=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
REPO=${REGISTRY}/finance-platform/dev/auth-service

docker build --build-arg SERVICE_NAME=auth-service --build-arg PORT=3001 -f apps/auth-service/Dockerfile -t ${REPO}:${GIT_SHA} -t ${REPO}:latest .
docker push ${REPO}:${GIT_SHA}
docker push ${REPO}:latest
```

Repeat for other services with matching Dockerfile + port.

---

## 8) Deploy Kubernetes manifests

### 8.1 Update image names in manifests
Replace `REPLACE_WITH_ECR/<service>:latest` with your ECR URLs.

### 8.2 Fill secrets
Edit each `infrastructure/k8s/*/all.yaml` and set required values in `stringData`.

### 8.3 Apply resources
```bash
kubectl apply -f infrastructure/k8s/base/namespace.yaml
kubectl apply -f infrastructure/k8s/auth-service/all.yaml
kubectl apply -f infrastructure/k8s/upload-service/all.yaml
kubectl apply -f infrastructure/k8s/processing-service/all.yaml
kubectl apply -f infrastructure/k8s/analytics-service/all.yaml
kubectl apply -f infrastructure/k8s/notification-service/all.yaml
kubectl apply -f infrastructure/k8s/base/ingress.yaml
```

### 8.4 Verify rollout
```bash
kubectl rollout status deployment/auth-service -n finance-platform
kubectl rollout status deployment/upload-service -n finance-platform
kubectl rollout status deployment/processing-service -n finance-platform
kubectl rollout status deployment/analytics-service -n finance-platform
kubectl rollout status deployment/notification-service -n finance-platform
```

### 8.5 Verify probes and HPA
```bash
kubectl get pods -n finance-platform
kubectl describe pod -n finance-platform <pod-name>
kubectl get hpa -n finance-platform
```

---

## 9) Validate ALB routing

Get ingress hostname:
```bash
kubectl get ingress -n finance-platform
```

Then test paths:
```bash
curl http://<ALB_DNS>/api/auth/health
curl http://<ALB_DNS>/api/upload/health
curl http://<ALB_DNS>/api/transactions
```

---

## 10) Configure GitHub Actions CI/CD

### 10.1 Required GitHub secret
Set repository secret:
- `AWS_GITHUB_ACTIONS_ROLE_ARN`

This should be an IAM role trusted by GitHub OIDC and permitted to:
- push to ECR
- read EKS cluster details
- run `kubectl apply` against your EKS cluster

### 10.2 Push to `main`
Pipeline in `.github/workflows/cicd.yml` will execute:
1. install
2. test
3. build
4. push (SHA + latest)
5. deploy + rollout checks

---

## 11) Cost optimization checklist (important)

- Keep node group to min/desired = 1 for learning.
- Use `t3.small` or `t3.micro` where viable.
- Delete cluster when not using it.
- NAT Gateway incurs cost; for strict budget, tear down when idle.
- Keep ECR lifecycle policies (already included).

---

## 12) Clean up (avoid surprise billing)

```bash
cd infrastructure/terraform
terraform destroy
```

Then remove remaining artifacts if desired:
- ECR images
- S3 state bucket and DynamoDB lock table (if project is finished)

---

## 13) Next production upgrades (later)

- External Secrets + AWS Secrets Manager
- TLS + ACM + HTTPS-only ingress
- Cluster autoscaler/Karpenter
- Separate environments (`dev`, `staging`, `prod`)
- RDS, ElastiCache, and observability stack (CloudWatch/Grafana/Prometheus)

