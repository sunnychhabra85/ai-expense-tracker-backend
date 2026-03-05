# Kubernetes Manifests

## Apply order
```bash
kubectl apply -f infrastructure/k8s/base/namespace.yaml
kubectl apply -f infrastructure/k8s/base/aws-load-balancer-controller-serviceaccount.yaml
kubectl apply -f infrastructure/k8s/auth-service/all.yaml
kubectl apply -f infrastructure/k8s/upload-service/all.yaml
kubectl apply -f infrastructure/k8s/processing-service/all.yaml
kubectl apply -f infrastructure/k8s/analytics-service/all.yaml
kubectl apply -f infrastructure/k8s/notification-service/all.yaml
kubectl apply -f infrastructure/k8s/base/ingress.yaml
```

## Notes
- Replace `REPLACE_WITH_ECR/...` images with your AWS ECR URIs.
- Replace Secret values with actual runtime secrets (or integrate External Secrets later).
- Ingress assumes AWS Load Balancer Controller is installed and `ingressClassName: alb` is available.
