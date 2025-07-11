#!/bin/bash

# Leaf Game Integration Tests Setup Script
# This script sets up the integration test environment

set -e

echo "🚀 Setting up Leaf Game Integration Tests..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Node.js is installed
check_node() {
    print_status "Checking Node.js installation..."
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js version 18+ is required. Current version: $(node --version)"
        exit 1
    fi
    
    print_success "Node.js $(node --version) is installed"
}

# Check if npm is installed
check_npm() {
    print_status "Checking npm installation..."
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm first."
        exit 1
    fi
    
    print_success "npm $(npm --version) is installed"
}

# Install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    npm install
    
    if [ $? -eq 0 ]; then
        print_success "Dependencies installed successfully"
    else
        print_error "Failed to install dependencies"
        exit 1
    fi
}

# Install Playwright browsers
install_browsers() {
    print_status "Installing Playwright browsers..."
    npm run install-browsers
    
    if [ $? -eq 0 ]; then
        print_success "Playwright browsers installed successfully"
    else
        print_error "Failed to install Playwright browsers"
        exit 1
    fi
}

# Create environment file
create_env_file() {
    print_status "Setting up environment configuration..."
    
    if [ ! -f .env ]; then
        if [ -f env.example ]; then
            cp env.example .env
            print_success "Created .env file from template"
        else
            print_warning "No env.example found. Creating basic .env file..."
            cat > .env << EOF
# Leaf Game Integration Tests Environment Configuration
TEST_BASE_URL=http://localhost:3000
LIVE_BASE_URL=https://leaf-game.herokuapp.com
TEST_TIMEOUT=30000
TEST_RETRIES=2
HEADED_MODE=false
DEBUG_MODE=false
EOF
            print_success "Created basic .env file"
        fi
    else
        print_warning ".env file already exists. Skipping creation."
    fi
}

# Create test directories
create_directories() {
    print_status "Creating test directories..."
    
    mkdir -p test-results
    mkdir -p playwright-report
    mkdir -p screenshots
    mkdir -p videos
    
    print_success "Test directories created"
}

# Run initial test
run_initial_test() {
    print_status "Running initial test to verify setup..."
    
    # Run a simple test to verify everything works
    npx playwright test --project=chromium --grep="should load the game interface correctly" || {
        print_warning "Initial test failed. This might be expected if the game server is not running."
        print_warning "Make sure your game server is running on http://localhost:3000"
    }
}

# Show next steps
show_next_steps() {
    echo ""
    echo -e "${GREEN}🎉 Setup completed successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Start your game server:"
    echo "   cd .. && npm start"
    echo ""
    echo "2. Run the integration tests:"
    echo "   npm test"
    echo ""
    echo "3. Run tests in headed mode (see browser):"
    echo "   npm run test:headed"
    echo ""
    echo "4. Run tests against live production:"
    echo "   npm run test:live"
    echo ""
    echo "5. View test reports:"
    echo "   npm run test:report"
    echo ""
    echo "For more information, see README.md"
    echo ""
}

# Main setup function
main() {
    echo "=========================================="
    echo "  Leaf Game Integration Tests Setup"
    echo "=========================================="
    echo ""
    
    check_node
    check_npm
    install_dependencies
    install_browsers
    create_env_file
    create_directories
    
    echo ""
    print_status "Setup completed! Running initial test..."
    run_initial_test
    
    show_next_steps
}

# Run main function
main "$@" 