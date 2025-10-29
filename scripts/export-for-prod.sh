#!/bin/bash

# ============================================================
# ALL-IN-ONE: Export database for production
# This script:
# 1. Replaces localhost URLs → test.md8av.com
# 2. Exports database to SQL file
# 3. Reverts URLs back to localhost
# ============================================================

set -e  # Exit on error

echo "================================================"
echo "🚀 Database Export for Production"
echo "================================================"
echo ""

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Parse DATABASE_URL
DB_URL="${DATABASE_URL}"
DB_USER=$(echo $DB_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo $DB_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo $DB_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $DB_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DB_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

# Fallbacks
DB_USER=${DB_USER:-root}
DB_PASS=${DB_PASS:-}
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-3306}
DB_NAME=${DB_NAME:-phub_api_v3}

echo "📍 Database: $DB_NAME"
echo "🌐 Host: $DB_HOST:$DB_PORT"
echo ""

# Create exports directory
mkdir -p exports

# Generate timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
EXPORT_FILE="exports/${DB_NAME}_${TIMESTAMP}.sql"

# ============================================================
# STEP 1: Replace localhost → production
# ============================================================
echo "📝 Step 1: Replacing localhost URLs with production URLs..."

mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" <<'EOF'
-- Update Video table
UPDATE `Video`
SET vodPlayUrl = REPLACE(
  REPLACE(vodPlayUrl, 'http://localhost:4444', 'https://test.md8av.com'),
  'http://localhost:3000', 'https://test.md8av.com'
)
WHERE vodPlayUrl LIKE '%localhost%';

UPDATE `Video`
SET vodPic = REPLACE(
  REPLACE(vodPic, 'http://localhost:4444', 'https://test.md8av.com'),
  'http://localhost:3000', 'https://test.md8av.com'
)
WHERE vodPic LIKE '%localhost%';

-- Update AdImpression referrer URLs
UPDATE `AdImpression`
SET referrer = REPLACE(
  REPLACE(referrer, 'http://localhost:4444', 'https://test.md8av.com'),
  'http://localhost:3000', 'https://test.md8av.com'
)
WHERE referrer LIKE '%localhost%';

-- Update ApiRequestLog referrer URLs
UPDATE `ApiRequestLog`
SET referer = REPLACE(
  REPLACE(referer, 'http://localhost:4444', 'https://test.md8av.com'),
  'http://localhost:3000', 'https://test.md8av.com'
)
WHERE referer LIKE '%localhost%';

-- Update ApiRequestLog domain column
UPDATE `ApiRequestLog`
SET domain = 'test.md8av.com'
WHERE domain IN ('localhost', 'localhost:4444', 'localhost:3000');

SELECT CONCAT('✅ Updated ', COUNT(*), ' videos') as result
FROM `Video`
WHERE vodPlayUrl LIKE '%test.md8av.com%';
EOF

echo ""

# ============================================================
# STEP 2: Export database
# ============================================================
echo "📦 Step 2: Exporting database..."

mysqldump \
  -h"$DB_HOST" \
  -P"$DB_PORT" \
  -u"$DB_USER" \
  -p"$DB_PASS" \
  --single-transaction \
  --quick \
  --lock-tables=false \
  --routines \
  --triggers \
  --events \
  "$DB_NAME" > "$EXPORT_FILE"

if [ $? -eq 0 ]; then
  FILE_SIZE=$(du -h "$EXPORT_FILE" | cut -f1)
  echo "✅ Export successful: $EXPORT_FILE ($FILE_SIZE)"
else
  echo "❌ Export failed!"
  exit 1
fi

echo ""

# ============================================================
# STEP 3: Revert URLs back to localhost
# ============================================================
echo "🔄 Step 3: Reverting URLs back to localhost..."

mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" <<'EOF'
-- Revert Video table
UPDATE `Video`
SET vodPlayUrl = REPLACE(vodPlayUrl, 'https://test.md8av.com', 'http://localhost:4444')
WHERE vodPlayUrl LIKE '%test.md8av.com%';

UPDATE `Video`
SET vodPic = REPLACE(vodPic, 'https://test.md8av.com', 'http://localhost:4444')
WHERE vodPic LIKE '%test.md8av.com%';

-- Revert AdImpression referrer URLs
UPDATE `AdImpression`
SET referrer = REPLACE(referrer, 'https://test.md8av.com', 'http://localhost:4444')
WHERE referrer LIKE '%test.md8av.com%';

-- Revert ApiRequestLog referrer URLs
UPDATE `ApiRequestLog`
SET referer = REPLACE(referer, 'https://test.md8av.com', 'http://localhost:4444')
WHERE referer LIKE '%test.md8av.com%';

-- Revert ApiRequestLog domain column
UPDATE `ApiRequestLog`
SET domain = 'localhost'
WHERE domain = 'test.md8av.com';

SELECT CONCAT('✅ Reverted ', COUNT(*), ' videos to localhost') as result
FROM `Video`
WHERE vodPlayUrl LIKE '%localhost%';
EOF

echo ""

# ============================================================
# Summary
# ============================================================
echo "================================================"
echo "✅ Export Complete!"
echo "================================================"
echo ""
echo "📁 File: $EXPORT_FILE"
echo "📊 Size: $FILE_SIZE"
echo ""
echo "🚀 Next steps:"
echo "   1. Upload $EXPORT_FILE to production server"
echo "   2. Import: mysql -u USER -p DATABASE < $EXPORT_FILE"
echo ""
echo "💡 Your local database URLs are back to localhost"
echo "================================================"
