git clone https://github.com/nnthanh101/realtime-fraud-detection-with-gnn-on-dgl
# git clone https://github.com/DevAx101/MicroServices

cd realtime-fraud-detection-with-gnn-on-dgl

echo "Install the dependencies of solution ..."
# npm install -g yarn aws-cdk
yarn install
npx projen

echo "Initialize the CDK toolkit stack into AWS environment (only for deploying via AWS CDK first time) ..."
yarn cdk-init

echo "Authenticate with below ECR repository in your AWS partition"
aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin 472162242644.dkr.ecr.us-east-1.amazonaws.com

yarn deploy