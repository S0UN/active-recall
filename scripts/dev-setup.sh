#!/bin/bash

# Development Environment Setup Script for Concept Organizer
#
# This script will:
# - Install required dependencies
# - Start Docker services
# - Initialize Qdrant collections
# - Run initial health checks
# - Set up development database

set -e  # Exit on any error

echo "🚀 Setting up Concept Organizer development environment..."

# =============================================================================
# ENVIRONMENT VALIDATION
# =============================================================================

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop and try again."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose >/dev/null 2>&1; then
    echo "❌ docker-compose not found. Please install Docker Compose."
    exit 1
fi

# Check if Node.js is available
if ! command -v node >/dev/null 2>&1; then
    echo "❌ Node.js not found. Please install Node.js 18+ and try again."
    exit 1
fi

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"
if ! node -e "process.exit(process.version.slice(1).split('.').reduce((a,b,i)=>a+b*Math.pow(1000,2-i),0) >= '$REQUIRED_VERSION'.split('.').reduce((a,b,i)=>a+b*Math.pow(1000,2-i),0) ? 0 : 1)"; then
    echo "❌ Node.js version $NODE_VERSION is too old. Please upgrade to 18.0.0 or later."
    exit 1
fi

echo "✅ Environment validation passed"

# =============================================================================
# DEPENDENCY INSTALLATION
# =============================================================================

echo "📦 Installing npm dependencies..."
npm install

# Add required packages for Concept Organizer
echo "📦 Adding Concept Organizer specific dependencies..."

# Core dependencies
npm install zod                      # Schema validation
npm install qdrant-js               # Qdrant client
npm install sqlite3                 # Local database
npm install redis                   # Caching layer
npm install uuid                    # ID generation

# Development dependencies  
npm install --save-dev @types/uuid

echo "✅ Dependencies installed"

# =============================================================================
# DOCKER SERVICES
# =============================================================================

echo "🐳 Starting Docker services..."

# Stop any existing services
docker-compose down 2>/dev/null || true

# Start services in detached mode
docker-compose up -d

echo "⏳ Waiting for services to be ready..."

# Wait for Qdrant to be healthy
for i in {1..30}; do
    if curl -s http://localhost:6333/health >/dev/null 2>&1; then
        echo "✅ Qdrant is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Qdrant failed to start after 60 seconds"
        docker-compose logs qdrant
        exit 1
    fi
    sleep 2
done

# Wait for Redis to be ready (if using)
for i in {1..15}; do
    if redis-cli -h localhost ping >/dev/null 2>&1; then
        echo "✅ Redis is ready"
        break
    fi
    if [ $i -eq 15 ]; then
        echo "⚠️  Redis not responding (this is optional)"
        break
    fi
    sleep 1
done

# =============================================================================
# QDRANT INITIALIZATION
# =============================================================================

echo "🔧 Initializing Qdrant collections..."

# Create concept artifacts collection
curl -X PUT "http://localhost:6333/collections/concept-artifacts" \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {
      "label": {
        "size": 384,
        "distance": "Cosine",
        "hnsw_config": {
          "m": 16,
          "ef_construct": 200
        }
      },
      "context": {
        "size": 384, 
        "distance": "Cosine",
        "hnsw_config": {
          "m": 16,
          "ef_construct": 200
        }
      }
    },
    "optimizers_config": {
      "default_segment_number": 2,
      "memmap_threshold": 10000
    }
  }' >/dev/null 2>&1 || true

# Create folder centroids collection
curl -X PUT "http://localhost:6333/collections/folder-centroids" \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {
      "size": 384,
      "distance": "Cosine", 
      "hnsw_config": {
        "m": 16,
        "ef_construct": 100
      }
    },
    "optimizers_config": {
      "default_segment_number": 1,
      "memmap_threshold": 5000
    }
  }' >/dev/null 2>&1 || true

echo "✅ Qdrant collections initialized"

# =============================================================================
# LOCAL DATABASE SETUP
# =============================================================================

echo "🗄️  Setting up local SQLite database..."

# Create database directory
mkdir -p ./data/sqlite

# Create basic schema (will be replaced by migrations later)
cat > ./data/sqlite/init.sql << 'EOF'
-- Basic schema for development
-- This will be replaced by proper migrations in Sprint 1

CREATE TABLE IF NOT EXISTS folder_manifests (
  folder_id TEXT PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  provisional BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS path_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  old_path TEXT NOT NULL,
  new_path TEXT NOT NULL, 
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS review_queue (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_folder_manifests_path ON folder_manifests(path);
CREATE INDEX IF NOT EXISTS idx_path_aliases_old_path ON path_aliases(old_path);
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON review_queue(status);
EOF

# Initialize database with schema
sqlite3 ./data/sqlite/concept-organizer.db < ./data/sqlite/init.sql

echo "✅ SQLite database initialized"

# =============================================================================
# HEALTH CHECKS
# =============================================================================

echo "🏥 Running health checks..."

# Check Qdrant collections
COLLECTIONS=$(curl -s http://localhost:6333/collections | jq -r '.result.collections[].name' 2>/dev/null || echo "")
if [[ "$COLLECTIONS" == *"concept-artifacts"* ]] && [[ "$COLLECTIONS" == *"folder-centroids"* ]]; then
    echo "✅ Qdrant collections verified"
else
    echo "⚠️  Warning: Qdrant collections may not be properly initialized"
fi

# Check database
if sqlite3 ./data/sqlite/concept-organizer.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" >/dev/null 2>&1; then
    echo "✅ SQLite database verified"
else
    echo "❌ SQLite database verification failed"
    exit 1
fi

# =============================================================================
# ENVIRONMENT FILE CREATION
# =============================================================================

echo "📝 Creating environment configuration..."

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    cat > .env << 'EOF'
# Concept Organizer Development Environment
NODE_ENV=development

# Vector Database
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION_CONCEPTS=concept-artifacts
QDRANT_COLLECTION_FOLDERS=folder-centroids

# Local Database  
SQLITE_DB_PATH=./data/sqlite/concept-organizer.db

# Cache Layer
REDIS_URL=redis://localhost:6379
ENABLE_REDIS_CACHE=true

# Processing Configuration
MIN_TEXT_LENGTH=10
MIN_WORD_COUNT=3
MAX_TEXT_LENGTH=5000
MIN_QUALITY_SCORE=0.3

# Routing Thresholds
HIGH_CONFIDENCE_THRESHOLD=0.82
LOW_CONFIDENCE_THRESHOLD=0.65
CROSS_LINK_DELTA=0.03
CROSS_LINK_MIN_SCORE=0.79

# Feature Flags
LOCAL_ONLY_MODE=true
ENABLE_LLM=false
ENABLE_RERANKER=false

# Logging
LOG_LEVEL=info
LOG_FILE=./data/logs/concept-organizer.log
EOF
    echo "✅ Created .env file with development defaults"
else
    echo "✅ Using existing .env file"
fi

# Create logs directory
mkdir -p ./data/logs

# =============================================================================
# FINAL SETUP
# =============================================================================

echo "🔧 Final setup steps..."

# Create development scripts directory if it doesn't exist
mkdir -p ./scripts

# Make this script executable
chmod +x ./scripts/dev-setup.sh

# Create a cleanup script
cat > ./scripts/dev-cleanup.sh << 'EOF'
#!/bin/bash
echo "🧹 Cleaning up development environment..."

# Stop Docker services
docker-compose down -v

# Remove data directories (be careful!)
read -p "Remove all data directories? This will delete all your development data (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf ./data/qdrant/*
    rm -rf ./data/redis/*
    rm -f ./data/sqlite/concept-organizer.db
    echo "✅ Data directories cleaned"
else
    echo "ℹ️  Data directories preserved"
fi

echo "✅ Cleanup complete"
EOF

chmod +x ./scripts/dev-cleanup.sh

# =============================================================================
# SUCCESS MESSAGE
# =============================================================================

echo ""
echo "🎉 Development environment setup complete!"
echo ""
echo "Services running:"
echo "  📊 Qdrant Vector DB:  http://localhost:6333"
echo "  💾 Redis Cache:       redis://localhost:6379" 
echo "  🗃️  SQLite Database:   ./data/sqlite/concept-organizer.db"
echo ""
echo "Next steps:"
echo "  1. npm run dev                    # Start development server"
echo "  2. npm test                       # Run tests"
echo "  3. ./scripts/dev-cleanup.sh       # Clean up when done"
echo ""
echo "Configuration:"
echo "  📝 Edit .env file to customize settings"
echo "  📋 Check docker-compose logs for service status"
echo ""
echo "Happy coding! 🚀"