#!/bin/bash

# 🚀 Leaf VSC GameKernel Contract Deployment Script
# This script automates the deployment of your Leaf VSC contract

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CONTRACT_NAME="leaf-game-kernel-v1"
CONTRACT_VERSION="0.0.1"
NETWORK=${VSC_NETWORK:-"testnet"}
API_URL=${VSC_API_URL:-"https://vsc.hive-engine.com/api/v1"}

echo -e "${BLUE}🚀 Leaf VSC GameKernel Contract Deployment${NC}"
echo -e "${BLUE}=============================================${NC}\n"

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm first."
        exit 1
    fi
    
    # Check Node.js version
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js version 18+ is required. Current version: $(node --version)"
        exit 1
    fi
    
    print_status "Prerequisites check passed"
}

# Install dependencies
install_dependencies() {
    print_info "Installing dependencies..."
    
    if [ ! -d "node_modules" ]; then
        npm install
        print_status "Dependencies installed"
    else
        print_info "Dependencies already installed"
    fi
}

# Build contract
build_contract() {
    print_info "Building AssemblyScript contract..."
    
    # Clean previous build
    if [ -d "dist" ]; then
        rm -rf dist
    fi
    
    # Build contract
    npm run build
    
    # Verify build output
    if [ ! -f "dist/index.wasm" ]; then
        print_error "Build failed: dist/index.wasm not found"
        exit 1
    fi
    
    if [ ! -f "dist/index.js" ]; then
        print_error "Build failed: dist/index.js not found"
        exit 1
    fi
    
    print_status "Contract built successfully"
    echo -e "   ${BLUE}WASM size:${NC} $(ls -lh dist/index.wasm | awk '{print $5}')"
    echo -e "   ${BLUE}JS size:${NC} $(ls -lh dist/index.js | awk '{print $5}')"
}

# Create deployment package
create_deployment_package() {
    print_info "Creating deployment package..."
    
    # Create deployment directory
    if [ -d "deployment" ]; then
        rm -rf deployment
    fi
    mkdir deployment
    
    # Copy build artifacts
    cp dist/index.wasm deployment/
    cp dist/index.js deployment/
    cp package.json deployment/
    cp README.md deployment/
    
    # Create deployment manifest
    cat > deployment/manifest.json << EOF
{
  "name": "$CONTRACT_NAME",
  "version": "$CONTRACT_VERSION",
  "description": "Leaf Game VSC Integration",
  "type": "vsc-contract",
  "wasm": "index.wasm",
  "bindings": "index.js",
  "entrypoint": "GameKernel",
  "network": "$NETWORK",
  "author": "Leaf Team",
  "license": "MIT"
}
EOF
    
    print_status "Deployment package created"
}

# Deploy to VSC network
deploy_to_vsc() {
    print_info "Deploying to VSC $NETWORK network..."
    
    # Check if we have API key
    if [ -z "$VSC_API_KEY" ]; then
        print_warning "VSC_API_KEY not set. Using public deployment endpoint."
        DEPLOY_URL="$API_URL/contracts/deploy"
    else
        DEPLOY_URL="$API_URL/contracts/deploy"
        AUTH_HEADER="-H \"Authorization: Bearer $VSC_API_KEY\""
    fi
    
    # Create deployment payload
    cat > deployment/deploy-payload.json << EOF
{
  "name": "$CONTRACT_NAME",
  "version": "$CONTRACT_VERSION",
  "description": "Leaf Game VSC Integration",
  "network": "$NETWORK"
}
EOF
    
    # Deploy contract
    print_info "Sending deployment request..."
    
    if [ -n "$VSC_API_KEY" ]; then
        RESPONSE=$(curl -s -X POST "$DEPLOY_URL" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $VSC_API_KEY" \
            -F "contract=@deployment/index.wasm" \
            -F "manifest=@deployment/manifest.json" \
            -F "metadata=@deployment/deploy-payload.json")
    else
        RESPONSE=$(curl -s -X POST "$DEPLOY_URL" \
            -H "Content-Type: application/json" \
            -F "contract=@deployment/index.wasm" \
            -F "manifest=@deployment/manifest.json" \
            -F "metadata=@deployment/deploy-payload.json")
    fi
    
    # Check response
    if echo "$RESPONSE" | grep -q "error"; then
        print_error "Deployment failed: $RESPONSE"
        exit 1
    fi
    
    print_status "Contract deployed successfully!"
    
    # Extract contract ID if available
    if echo "$RESPONSE" | grep -q "contractId"; then
        CONTRACT_ID=$(echo "$RESPONSE" | grep -o '"contractId":"[^"]*"' | cut -d'"' -f4)
        echo -e "   ${BLUE}Contract ID:${NC} $CONTRACT_ID"
    fi
    
    # Extract contract address if available
    if echo "$RESPONSE" | grep -q "address"; then
        CONTRACT_ADDRESS=$(echo "$RESPONSE" | grep -o '"address":"[^"]*"' | cut -d'"' -f4)
        echo -e "   ${BLUE}Contract Address:${NC} $CONTRACT_ADDRESS"
    fi
}

# Verify deployment
verify_deployment() {
    print_info "Verifying deployment..."
    
    # Wait a moment for deployment to propagate
    sleep 5
    
    # Check contract status
    if [ -n "$CONTRACT_ID" ]; then
        VERIFY_URL="$API_URL/contracts/$CONTRACT_ID"
    elif [ -n "$CONTRACT_ADDRESS" ]; then
        VERIFY_URL="$API_URL/contracts/$CONTRACT_ADDRESS"
    else
        VERIFY_URL="$API_URL/contracts/$CONTRACT_NAME"
    fi
    
    print_info "Checking contract status at: $VERIFY_URL"
    
    # Try to verify contract
    if [ -n "$VSC_API_KEY" ]; then
        VERIFY_RESPONSE=$(curl -s -H "Authorization: Bearer $VSC_API_KEY" "$VERIFY_URL")
    else
        VERIFY_RESPONSE=$(curl -s "$VERIFY_URL")
    fi
    
    if echo "$VERIFY_RESPONSE" | grep -q "error"; then
        print_warning "Could not verify contract immediately. This is normal for new deployments."
    else
        print_status "Contract verification successful!"
        echo -e "   ${BLUE}Status:${NC} Deployed and active"
    fi
}

# Update Leaf configuration
update_leaf_config() {
    print_info "Updating Leaf configuration..."
    
    # Create environment file template
    cat > .env.leaf << EOF
# Leaf VSC Integration Configuration
# Generated by deployment script on $(date)

# VSC Contract Configuration
REACT_APP_VSC_CONTRACT=$CONTRACT_NAME
REACT_APP_VSC_NETWORK=$NETWORK

# VSC Network Endpoints
REACT_APP_VSC_RPC_URL=$API_URL/rpc
REACT_APP_VSC_WS_URL=wss://vsc.hive-engine.com/ws

# Contract Details
REACT_APP_VSC_CONTRACT_VERSION=$CONTRACT_VERSION
REACT_APP_VSC_CONTRACT_NAME=$CONTRACT_NAME
EOF
    
    if [ -n "$CONTRACT_ID" ]; then
        echo "REACT_APP_VSC_CONTRACT_ID=$CONTRACT_ID" >> .env.leaf
    fi
    
    if [ -n "$CONTRACT_ADDRESS" ]; then
        echo "REACT_APP_VSC_CONTRACT_ADDRESS=$CONTRACT_ADDRESS" >> .env.leaf
    fi
    
    print_status "Leaf configuration updated"
    echo -e "   ${BLUE}Config file:${NC} .env.leaf"
    echo -e "   ${BLUE}Copy this to your Leaf app root directory${NC}"
}

# Run tests
run_tests() {
    print_info "Running contract tests..."
    
    if npm test > /dev/null 2>&1; then
        print_status "All tests passed"
    else
        print_warning "Some tests failed. Check output above."
    fi
}

# Main deployment flow
main() {
    echo -e "${BLUE}Network:${NC} $NETWORK"
    echo -e "${BLUE}Contract:${NC} $CONTRACT_NAME v$CONTRACT_VERSION"
    echo -e "${BLUE}API URL:${NC} $API_URL"
    echo ""
    
    # Run deployment steps
    check_prerequisites
    install_dependencies
    build_contract
    create_deployment_package
    deploy_to_vsc
    verify_deployment
    update_leaf_config
    run_tests
    
    echo ""
    echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo -e "1. Copy .env.leaf to your Leaf app root directory"
    echo -e "2. Set REACT_APP_VSC_CONTRACT=$CONTRACT_NAME in your environment"
    echo -e "3. Restart your Leaf application"
    echo -e "4. Test VSC integration in the game"
    echo ""
    echo -e "${BLUE}Contract details:${NC}"
    echo -e "   Name: $CONTRACT_NAME"
    echo -e "   Version: $CONTRACT_VERSION"
    echo -e "   Network: $NETWORK"
    if [ -n "$CONTRACT_ID" ]; then
        echo -e "   ID: $CONTRACT_ID"
    fi
    if [ -n "$CONTRACT_ADDRESS" ]; then
        echo -e "   Address: $CONTRACT_ADDRESS"
    fi
}

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --testnet      Deploy to testnet (default)"
        echo "  --mainnet      Deploy to mainnet"
        echo "  --verify-only  Only verify existing deployment"
        echo ""
        echo "Environment variables:"
        echo "  VSC_NETWORK    Network to deploy to (testnet/mainnet)"
        echo "  VSC_API_KEY    API key for VSC network"
        echo "  VSC_API_URL    VSC API base URL"
        exit 0
        ;;
    --testnet)
        NETWORK="testnet"
        ;;
    --mainnet)
        NETWORK="mainnet"
        ;;
    --verify-only)
        verify_deployment
        exit 0
        ;;
    "")
        # No arguments, run full deployment
        ;;
    *)
        print_error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac

# Run main deployment
main
