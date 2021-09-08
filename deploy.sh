git clone https://github.com/nnthanh101/realtime-fraud-detection-with-gnn-on-dgl
# git clone https://github.com/DevAx101/MicroServices
# npm install -g yarn aws-cdk
# python -m pip install --upgrade pip

cd realtime-fraud-detection-with-gnn-on-dgl

echo "Install the dependencies of solution ..."
yarn install
npx projen
yarn build

echo "Initialize the CDK toolkit stack into AWS environment (only for deploying via AWS CDK first time) ..."
yarn cdk-init

echo "Authenticate with below ECR repository in your AWS partition"
export AWS_ACCOUNT=$(aws sts get-caller-identity --output text --query Account)
export AWS_REGION=$(curl -s 169.254.169.254/latest/dynamic/instance-identity/document | jq -r '.region')
echo ${AWS_ACCOUNT} + ${AWS_REGION}
$(aws ecr get-login-password --region ${AWS_REGION}) | docker login --username AWS --password-stdin ${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com
aws ecr get-login-password | docker login --username AWS --password-stdin 472162242644.dkr.ecr.us-east-1.amazonaws.com

$(aws ecr get-login --region ${AWS_REGION})

docker login -u AWS -p $(aws ecr get-login-password --region us-east-1) 472162242644.dkr.ecr.us-east-1.amazonaws.com

yarn deploy
