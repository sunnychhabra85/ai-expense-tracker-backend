output "vpc_id" { value = aws_vpc.this.id }
output "public_subnet_ids" { value = [for s in aws_subnet.public : s.id] }
output "private_subnet_ids" { value = [for s in aws_subnet.private : s.id] }
output "eks_cluster_sg_id" { value = aws_security_group.eks_cluster.id }
output "eks_node_sg_id" { value = aws_security_group.eks_node.id }
