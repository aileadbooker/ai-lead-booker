#!/bin/bash

# Installation Verification Script for AI Lead Booker

echo "🔍 Verifying AI Lead Booker Installation..."
echo ""

# Check Node.js
echo "Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js installed: $NODE_VERSION"
else
    echo "❌ Node.js NOT installed (required: v18+)"
    echo "   Install from: https://nodejs.org/"
fi

# Check PostgreSQL
echo ""
echo "Checking PostgreSQL..."
if command -v psql &> /dev/null; then
    PSQL_VERSION=$(psql --version | head -n1)
    echo "✅ PostgreSQL installed: $PSQL_VERSION"
else
    echo "❌ PostgreSQL NOT installed (required: v14+)"
    echo "   Install: brew install postgresql"
fi

# Check if database exists
echo ""
echo "Checking database..."
if psql -lqt | cut -d \| -f 1 | grep -qw lead_booker; then
    echo "✅ Database 'lead_booker' exists"
else
    echo "⚠️  Database 'lead_booker' not found"
    echo "   Run: createdb lead_booker"
fi

# Check .env file
echo ""
echo "Checking configuration..."
if [ -f ".env" ]; then
    echo "✅ .env file exists"
    
    # Check required keys
    MISSING_KEYS=()
    
    grep -q "DATABASE_URL" .env || MISSING_KEYS+=("DATABASE_URL")
    grep -q "OPENAI_API_KEY" .env || MISSING_KEYS+=("OPENAI_API_KEY")
    grep -q "GOOGLE_CLIENT_ID" .env || MISSING_KEYS+=("GOOGLE_CLIENT_ID")
    grep -q "GOOGLE_REFRESH_TOKEN" .env || MISSING_KEYS+=("GOOGLE_REFRESH_TOKEN")
    
    if [ ${#MISSING_KEYS[@]} -eq 0 ]; then
        echo "✅ All required environment variables present"
    else
        echo "⚠️  Missing environment variables: ${MISSING_KEYS[*]}"
    fi
else
    echo "❌ .env file NOT found"
    echo "   Run: cp .env.example .env"
fi

# Check node_modules
echo ""
echo "Checking dependencies..."
if [ -d "node_modules" ]; then
    echo "✅ Dependencies installed"
else
    echo "⚠️  Dependencies not installed"
    echo "   Run: npm install"
fi

# Check if schema is loaded
echo ""
echo "Checking database schema..."
if psql lead_booker -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'leads';" 2>/dev/null | grep -q "1"; then
    echo "✅ Database schema loaded"
else
    echo "⚠️  Database schema not loaded"
    echo "   Run: psql lead_booker < database/schema.sql"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Installation Status Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "1. Install any missing dependencies above"
echo "2. Run: npm install"
echo "3. Set up database: createdb lead_booker && psql lead_booker < database/schema.sql"
echo "4. Configure .env with your API keys"
echo "5. Run: npm run build && npm start"
echo ""
echo "See SETUP.md for detailed instructions"
