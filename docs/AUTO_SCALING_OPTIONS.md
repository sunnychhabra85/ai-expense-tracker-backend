# Auto-Scaling Implementation Guide
## From Single EC2 to Auto-Scaling Architecture

This guide explains how to migrate from the free tier single EC2 deployment to auto-scaling architectures.

---

## 📊 Current Architecture (No Auto-Scaling)

```
Single EC2 t2.micro
├── Nginx
├── 6 Microservices
├── PostgreSQL (container)
└── Redis (container)

Limitations:
❌ No horizontal scaling
❌ No high availability
❌ Limited to 1 GB RAM
❌ Single point of failure
```

**Cost**: Free (first 12 months), then ~$10/month

---

## 🚀 Option 1: ECS with Fargate (Serverless Containers)

### Architecture
```
Internet
   ↓
Application Load Balancer
   ↓
ECS Fargate Services (Auto-scaling 2-10 tasks each)
├── Auth Service
├── Upload Service
├── Processing Service
├── Analytics Service
└── Notification Service
   ↓
RDS PostgreSQL + ElastiCache Redis
```

### Cost Estimate
- **ALB**: ~$16/month
- **ECS Fargate**: ~$25-40/month (5 services, 0.25 vCPU each)
- **RDS db.t3.micro**: ~$15/month (free tier eligible)
- **ElastiCache t3.micro**: ~$12/month
- **Total**: ~$68-83/month (can be ~$35/month with RDS free tier)

### Auto-Scaling Configuration
```yaml
# Auto-scaling based on CPU
ScalingPolicy:
  TargetTrackingScaling:
    TargetValue: 70.0  # Target 70% CPU
    ScaleOutCooldown: 60
    ScaleInCooldown: 300
    
MinCapacity: 2  # Minimum tasks per service
MaxCapacity: 10 # Maximum tasks per service
```

### Scaling Triggers
- CPU Utilization > 70% → Scale out
- Memory Utilization > 80% → Scale out
- Request Count > 1000/min → Scale out
- Custom CloudWatch metrics

### Setup Time
⏱️ **2-3 hours** (with Terraform)

### Pros
✅ Fully managed, no server maintenance  
✅ Built-in auto-scaling  
✅ Pay only for what you use  
✅ Easy blue/green deployments  
✅ Integrates with AWS tools  

### Cons
❌ More expensive than EC2  
❌ Cold start times (minimal)  
❌ Less control over infrastructure  

### When to Use
- Production apps with variable traffic
- Don't want to manage servers
- Need quick deployments
- Budget: $50-100/month

---

## 🎯 Option 2: ECS with EC2 Auto Scaling Groups

### Architecture
```
Internet
   ↓
Application Load Balancer
   ↓
ECS Cluster (EC2 Launch Type)
├── Auto Scaling Group (2-5 t3.small instances)
│   └── ECS Agent running containers
│
RDS PostgreSQL + ElastiCache Redis
```

### Cost Estimate
- **ALB**: ~$16/month
- **EC2 t3.small** (2-5 instances): ~$15-40/month
- **RDS db.t3.micro**: ~$15/month
- **ElastiCache t3.micro**: ~$12/month
- **Total**: ~$58-83/month

### Auto-Scaling Configuration

#### Cluster Auto-Scaling (EC2 Instances)
```json
{
  "MinSize": 2,
  "MaxSize": 5,
  "DesiredCapacity": 2,
  "ScalingPolicies": [
    {
      "PolicyName": "cpu-scale-out",
      "AdjustmentType": "ChangeInCapacity",
      "ScalingAdjustment": 1,
      "Cooldown": 300,
      "MetricAggregationType": "Average",
      "TargetValue": 70
    }
  ]
}
```

#### Service Auto-Scaling (Containers)
```json
{
  "ServiceName": "auth-service",
  "MinCapacity": 2,
  "MaxCapacity": 10,
  "TargetTrackingScalingPolicyConfiguration": {
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    }
  }
}
```

### Setup Time
⏱️ **3-4 hours** (with Terraform)

### Pros
✅ More cost-effective than Fargate  
✅ Full control over instances  
✅ Can use Spot instances for savings  
✅ Better for consistent workloads  

### Cons
❌ Must manage EC2 instances  
❌ More complex than Fargate  
❌ Slower scaling than Fargate  

### When to Use
- Consistent traffic patterns
- Want more control
- Need cost optimization
- Budget: $50-80/month

---

## ⚙️ Option 3: AWS EKS (Kubernetes)

### Architecture
```
Internet
   ↓
Application Load Balancer (or Ingress Controller)
   ↓
EKS Cluster
├── Cluster Autoscaler (scales nodes)
├── Horizontal Pod Autoscaler (scales pods)
├── Node Group (t3.medium 2-10 nodes)
│   └── Kubernetes Pods
│       ├── Auth Deployment (2-10 replicas)
│       ├── Upload Deployment (2-10 replicas)
│       ├── Processing Deployment (2-10 replicas)
│       ├── Analytics Deployment (2-10 replicas)
│       └── Notification Deployment (2-10 replicas)
│
RDS PostgreSQL + ElastiCache Redis
```

### Cost Estimate
- **EKS Control Plane**: $72/month (fixed cost)
- **EC2 t3.medium** (2-5 nodes): ~$30-75/month
- **ALB**: ~$16/month
- **RDS db.t3.small**: ~$25/month
- **ElastiCache t3.micro**: ~$12/month
- **Total**: ~$155-200/month

### Auto-Scaling Configuration

#### Horizontal Pod Autoscaler (HPA)
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: auth-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: auth-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
```

#### Cluster Autoscaler (Nodes)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cluster-autoscaler
  namespace: kube-system
spec:
  template:
    spec:
      containers:
      - name: cluster-autoscaler
        image: k8s.gcr.io/autoscaling/cluster-autoscaler:v1.27.0
        command:
          - ./cluster-autoscaler
          - --v=4
          - --cloud-provider=aws
          - --skip-nodes-with-local-storage=false
          - --expander=least-waste
          - --node-group-auto-discovery=asg:tag=k8s.io/cluster-autoscaler/enabled,k8s.io/cluster-autoscaler/finance-cluster
          - --balance-similar-node-groups
          - --skip-nodes-with-system-pods=false
        env:
          - name: AWS_REGION
            value: us-east-1
```

#### Vertical Pod Autoscaler (VPA) - Optional
```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: auth-service-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: auth-service
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
    - containerName: "*"
      minAllowed:
        cpu: 100m
        memory: 128Mi
      maxAllowed:
        cpu: 1000m
        memory: 1Gi
```

### Scaling Features
1. **HPA**: Scales pods based on CPU/Memory/Custom metrics
2. **Cluster Autoscaler**: Adds/removes nodes based on pod requirements
3. **VPA**: Adjusts CPU/Memory requests automatically
4. **KEDA**: Event-driven autoscaling (SQS queue length, etc.)

### Setup Time
⏱️ **1-2 days** (learning Kubernetes + setup)

### Pros
✅ Industry standard, portable  
✅ Most powerful and flexible  
✅ Multi-cloud support  
✅ Rich ecosystem  
✅ Advanced deployment strategies  
✅ Perfect for microservices  

### Cons
❌ Expensive ($72/month minimum)  
❌ Steep learning curve  
❌ Complex to maintain  
❌ Overkill for small apps  

### When to Use
- Large-scale applications
- Multi-cloud strategy
- Need advanced features
- Team familiar with K8s
- Budget: $150+/month

---

## 🐳 Option 4: Docker Swarm (Budget-Friendly)

### Architecture
```
Internet
   ↓
ALB or Nginx Load Balancer
   ↓
Docker Swarm Cluster
├── Manager Nodes (1-3 t3.micro)
├── Worker Nodes (2-5 t3.small)
│   └── Swarm Services (auto-scaling)
│       ├── Auth Service (replicas: 2-6)
│       ├── Upload Service (replicas: 2-6)
│       └── ... other services
│
RDS PostgreSQL + ElastiCache Redis (or containers)
```

### Cost Estimate
- **EC2 t3.micro** (3 managers): ~$9/month
- **EC2 t3.small** (2-5 workers): ~$15-38/month
- **RDS db.t3.micro**: ~$15/month (optional)
- **Total**: ~$39-62/month

### Auto-Scaling Configuration

#### Service with Auto-Scaling
```bash
# Create service with replicas
docker service create \
  --name auth-service \
  --replicas 3 \
  --update-parallelism 1 \
  --update-delay 10s \
  --rollback-parallelism 1 \
  --rollback-delay 10s \
  --constraint 'node.role==worker' \
  --limit-cpu 0.5 \
  --limit-memory 256M \
  --reserve-cpu 0.25 \
  --reserve-memory 128M \
  your-image:latest
```

#### Scale Service Manually
```bash
# Scale up
docker service scale auth-service=5

# Scale down
docker service scale auth-service=2

# Auto-scale based on metrics (custom script)
# Docker Swarm doesn't have built-in auto-scaling
# You need to write scripts or use third-party tools
```

#### Custom Auto-Scaling Script
```bash
#!/bin/bash
# Simple CPU-based auto-scaling for Docker Swarm

SERVICE_NAME="auth-service"
MIN_REPLICAS=2
MAX_REPLICAS=10
TARGET_CPU=70

while true; do
    # Get average CPU usage
    CPU_USAGE=$(docker stats --no-stream --format "{{.CPUPerc}}" | \
                sed 's/%//' | \
                awk '{sum+=$1} END {print sum/NR}')
    
    CURRENT_REPLICAS=$(docker service ls --filter name=$SERVICE_NAME \
                       --format "{{.Replicas}}" | cut -d'/' -f1)
    
    if (( $(echo "$CPU_USAGE > $TARGET_CPU" | bc -l) )); then
        # Scale up
        NEW_REPLICAS=$((CURRENT_REPLICAS + 1))
        if [ $NEW_REPLICAS -le $MAX_REPLICAS ]; then
            docker service scale $SERVICE_NAME=$NEW_REPLICAS
            echo "Scaled up to $NEW_REPLICAS replicas"
        fi
    elif (( $(echo "$CPU_USAGE < 30" | bc -l) )); then
        # Scale down
        NEW_REPLICAS=$((CURRENT_REPLICAS - 1))
        if [ $NEW_REPLICAS -ge $MIN_REPLICAS ]; then
            docker service scale $SERVICE_NAME=$NEW_REPLICAS
            echo "Scaled down to $NEW_REPLICAS replicas"
        fi
    fi
    
    sleep 60  # Check every minute
done
```

### Setup Time
⏱️ **4-6 hours**

### Pros
✅ Built into Docker, no extra tools  
✅ Much cheaper than EKS  
✅ Simpler than Kubernetes  
✅ Good for small-medium apps  
✅ Can run on smaller instances  

### Cons
❌ No native auto-scaling (need scripts)  
❌ Smaller community than K8s  
❌ Less features than K8s  
❌ Limited cloud integration  

### When to Use
- Budget-conscious but need scaling
- Familiar with Docker
- Don't need Kubernetes complexity
- Budget: $40-60/month

---

## 📊 Comparison Table

| Feature | Current (Free) | ECS Fargate | ECS EC2 | EKS | Docker Swarm |
|---------|----------------|-------------|----------|-----|--------------|
| **Cost/Month** | $0-10 | $35-80 | $50-80 | $150-200 | $40-60 |
| **Setup Time** | 1 hour | 2-3 hours | 3-4 hours | 1-2 days | 4-6 hours |
| **Auto-Scaling** | ❌ No | ✅ Native | ✅ Native | ✅ Native | ⚠️ Custom |
| **High Availability** | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Maintenance** | Low | Very Low | Medium | High | Medium |
| **Learning Curve** | Easy | Easy | Medium | Hard | Medium |
| **Scalability** | 1 instance | Unlimited | High | Unlimited | Medium |
| **Best For** | Dev/Test | Small Prod | Med Prod | Large Prod | Budget Prod |

---

## 🎯 Recommendation Based on Use Case

### Scenario 1: Just Starting, Testing Waters
**Recommendation**: Stay with current Free Tier setup  
**Reason**: Learn, build, test without costs

### Scenario 2: Getting Real Users (< 100/day)
**Recommendation**: ECS Fargate  
**Reason**: Easy, managed, scales automatically  
**Budget**: $40-60/month

### Scenario 3: Growing Users (100-1000/day)
**Recommendation**: ECS with EC2 Auto Scaling  
**Reason**: Cost-effective, reliable, good balance  
**Budget**: $50-100/month

### Scenario 4: Scaling Fast (1000+ users/day)
**Recommendation**: EKS (Kubernetes)  
**Reason**: Industry standard, best features  
**Budget**: $150-300/month

### Scenario 5: Tight Budget but Need Scaling
**Recommendation**: Docker Swarm  
**Reason**: Cheapest option with multi-instance support  
**Budget**: $40-70/month

---

## 📝 Next Steps

Choose your path:

1. **[ECS Fargate Setup Guide](infrastructure/ecs-fargate-autoscaling.md)** (Coming soon)
2. **[ECS EC2 Auto Scaling Guide](infrastructure/ecs-ec2-autoscaling.md)** (Coming soon)
3. **[EKS Kubernetes Guide](infrastructure/eks-autoscaling.md)** (Coming soon)
4. **[Docker Swarm Guide](infrastructure/docker-swarm-setup.md)** (Coming soon)

Would you like me to create detailed setup guides for any of these options?

---

## 💡 Migration Path

### Phase 1: Prepare (Current Free Tier)
- Test application thoroughly
- Setup monitoring (CloudWatch)
- Document performance metrics
- Estimate traffic patterns

### Phase 2: Database Migration
- Migrate PostgreSQL to RDS
- Migrate Redis to ElastiCache
- Test connectivity

### Phase 3: Container Registry
- Push images to ECR
- Setup CI/CD pipeline
- Automate builds

### Phase 4: Choose & Deploy Auto-Scaling
- Select option based on budget/needs
- Deploy using Terraform/CloudFormation
- Configure auto-scaling policies
- Setup monitoring and alerts

### Phase 5: Cutover
- Test in staging environment
- Gradual traffic migration
- Monitor performance
- Decommission old EC2

**Total Migration Time**: 1-2 weeks (depending on option)

---

## 🆘 Need Help Deciding?

Ask yourself:

1. **Monthly Budget?**
   - < $50 → Docker Swarm or stay Free Tier
   - $50-100 → ECS Fargate or ECS EC2
   - $150+ → EKS

2. **Technical Expertise?**
   - Beginner → ECS Fargate
   - Intermediate → ECS EC2 or Docker Swarm
   - Advanced → EKS

3. **Scale Requirements?**
   - < 1000 users → ECS Fargate
   - 1000-10000 users → ECS EC2
   - 10000+ users → EKS

4. **Time to Deploy?**
   - Need fast → ECS Fargate
   - Have time → EKS

Let me know which option interests you, and I can create detailed implementation files!
