# 🚀 VSC GameKernel Contract Deployment Guide

## Overview

This guide will walk you through deploying your Leaf VSC GameKernel smart contract to the VSC (Virtual Smart Chain) network. The contract is written in AssemblyScript and will be compiled to WebAssembly for deployment.

## 🎯 What We're Deploying

- **Contract Name**: `leaf-game-kernel-v1`
- **Language**: AssemblyScript → WebAssembly
- **Network**: VSC (Virtual Smart Chain)
- **Purpose**: Game logic and verb runtime for Leaf text adventures

## 📋 Prerequisites

### Required Tools
- **Node.js 18+** - For building and testing
- **npm** - Package management
- **Massa CLI** - For contract deployment (if using Massa network)
- **VSC Network Access** - API endpoints and credentials

### Environment Setup
```bash
# Check Node.js version
node --version  # Should be 18.0.0 or higher

# Check npm version
npm --version   # Should be 8.0.0 or higher

# Install dependencies
cd contracts/vsc-gamekernel
npm install
```

## 🏗️ Building the Contract

### 1. Build AssemblyScript to WebAssembly
```bash
# Build the contract
npm run build

# This creates:
# - dist/index.wasm (WebAssembly binary)
# - dist/index.js (JavaScript bindings)
```

### 2. Verify Build Output
```bash
# Check build artifacts
ls -la dist/

# Should see:
# - index.wasm (compiled contract)
# - index.js (bindings)
```

## 🔧 Contract Configuration

### 1. Contract Parameters
```typescript
// Key contract settings
const CONTRACT_CONFIG = {
  name: 'leaf-game-kernel-v1',
  version: '0.0.1',
  description: 'Leaf Game VSC Integration',
  author: 'Leaf Team',
  network: 'testnet' // or 'mainnet'
};
```

### 2. Environment Variables
```bash
# Create .env file
cp .env.example .env

# Set your configuration
VSC_NETWORK=testnet
VSC_CONTRACT_NAME=leaf-game-kernel-v1
VSC_API_URL=https://vsc.hive-engine.com/api/v1/graphql
VSC_RPC_URL=https://vsc.hive-engine.com/rpc
VSC_WS_URL=wss://vsc.hive-engine.com/ws
```

## 🚀 Deployment Options

### Option 1: VSC Network Deployment (Recommended)

#### Step 1: Prepare Contract Package
```bash
# Create deployment package
mkdir deployment
cp dist/index.wasm deployment/
cp dist/index.js deployment/
cp package.json deployment/
cp README.md deployment/

# Create deployment manifest
cat > deployment/manifest.json << EOF
{
  "name": "leaf-game-kernel-v1",
  "version": "0.0.1",
  "description": "Leaf Game VSC Integration",
  "type": "vsc-contract",
  "wasm": "index.wasm",
  "bindings": "index.js",
  "entrypoint": "GameKernel",
  "network": "testnet"
}
EOF
```

#### Step 2: Deploy to VSC Network
```bash
# Using VSC CLI (if available)
vsc deploy deployment/

# Or using VSC API directly
curl -X POST https://vsc.hive-engine.com/api/v1/contracts/deploy \
  -H "Content-Type: application/json" \
  -F "contract=@deployment/index.wasm" \
  -F "manifest=@deployment/manifest.json"
```

### Option 2: Massa Network Deployment

#### Step 1: Install Massa CLI
```bash
# Install Massa CLI
npm install -g @massalabs/massa-cli

# Or download from GitHub releases
# https://github.com/massalabs/massa/releases
```

#### Step 2: Configure Massa
```bash
# Set up Massa configuration
massa config set --endpoint https://test.massa.net/api/v2

# Set your wallet
massa wallet add --name leaf-deployer
```

#### Step 3: Deploy Contract
```bash
# Deploy to Massa testnet
massa contract deploy \
  --contract dist/index.wasm \
  --name leaf-game-kernel-v1 \
  --description "Leaf Game VSC Integration"
```

### Option 3: Manual Deployment via API

#### Step 1: Prepare Contract Data
```bash
# Encode contract as base64
base64 -i dist/index.wasm > contract.b64

# Create deployment payload
cat > deploy-payload.json << EOF
{
  "contract": "$(cat contract.b64)",
  "name": "leaf-game-kernel-v1",
  "version": "0.0.1",
  "description": "Leaf Game VSC Integration",
  "network": "testnet"
}
EOF
```

#### Step 2: Send Deployment Request
```bash
# Deploy via API
curl -X POST https://vsc.hive-engine.com/api/v1/contracts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d @deploy-payload.json
```

## ✅ Post-Deployment Verification

### 1. Check Contract Status
```bash
# Verify contract is deployed
curl https://vsc.hive-engine.com/api/v1/contracts/leaf-game-kernel-v1

# Should return contract details
```

### 2. Test Contract Functions
```bash
# Test basic functionality
npm run test:simple

# Run full integration tests
npm test
```

### 3. Verify in Leaf Game
```bash
# Set environment variable in your Leaf app
export REACT_APP_VSC_CONTRACT=leaf-game-kernel-v1

# Start Leaf and test VSC integration
npm start
```

## 🔍 Troubleshooting

### Common Issues

#### Build Failures
```bash
# Clean and rebuild
npm run clean
npm install
npm run build

# Check AssemblyScript version
npx asc --version
```

#### Deployment Failures
```bash
# Check network connectivity
curl https://vsc.hive-engine.com/api/v1/health

# Verify contract size
ls -lh dist/index.wasm

# Check for syntax errors
npx asc assembly/index.ts --outFile dist/test.wasm --bindings esm
```

#### Contract Not Found
```bash
# Verify deployment
curl https://vsc.hive-engine.com/api/v1/contracts

# Check contract name spelling
# Ensure network matches (testnet vs mainnet)
```

## 📊 Monitoring & Maintenance

### 1. Contract Health Checks
```bash
# Monitor contract status
curl https://vsc.hive-engine.com/api/v1/contracts/leaf-game-kernel-v1/health

# Check recent transactions
curl https://vsc.hive-engine.com/api/v1/contracts/leaf-game-kernel-v1/transactions
```

### 2. Update Contract
```bash
# For contract updates
npm run build
# Follow deployment steps again with new version
```

### 3. Rollback Plan
```bash
# Keep previous versions
cp -r deployment deployment-v0.0.1

# Document deployment history
echo "$(date): Deployed v0.0.1" >> deployment-history.log
```

## 🔐 Security Considerations

### 1. Access Control
- Limit who can deploy contracts
- Use environment variables for sensitive data
- Implement proper authentication

### 2. Contract Validation
- Test thoroughly before deployment
- Use testnet first
- Validate all inputs and outputs

### 3. Network Security
- Use HTTPS for all API calls
- Implement rate limiting
- Monitor for suspicious activity

## 📚 Additional Resources

### Documentation
- [VSC Network API Docs](https://vsc.hive-engine.com/docs)
- [AssemblyScript Guide](https://www.assemblyscript.org/)
- [Massa Documentation](https://docs.massa.net/)

### Support
- [VSC Community](https://discord.gg/vsc)
- [Massa Discord](https://discord.gg/massa)
- [Leaf Project Issues](https://github.com/your-repo/issues)

## 🎯 Next Steps

1. **Choose deployment option** (VSC Network recommended)
2. **Set up environment** and build contract
3. **Deploy to testnet** first
4. **Verify functionality** with tests
5. **Update Leaf configuration** with contract address
6. **Test integration** in development
7. **Deploy to mainnet** when ready

---

**Ready to deploy? Let's get your Leaf VSC contract live! 🚀**
