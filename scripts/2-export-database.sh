#!/bin/bash

# ============================================================
# STEP 2: Export database to SQL file
# ============================================================

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Parse DATABASE_URL to get connection details
# Format: mysql://user:password@host:port/database
DB_URL="${DATABASE_URL}"
DB_USER=$(echo $DB_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo $DB_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo $DB_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $DB_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DB_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

# Fallback to defaults if parsing fails
DB_USER=${DB_USER:-root}
DB_PASS=${DB_PASS:-}
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-3306}
DB_NAME=${DB_NAME:-phub_api_v3}

# Create exports directory
mkdir -p exports

# Generate timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Export database
echo "🚀 Exporting database: $DB_NAME"
echo "📍 Host: $DB_HOST:$DB_PORT"
echo "👤 User: $DB_USER"
echo ""

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
  "$DB_NAME" > "exports/${DB_NAME}_${TIMESTAMP}.sql"

if [ $? -eq 0 ]; then
  echo "✅ Export successful!"
  echo "📁 File: exports/${DB_NAME}_${TIMESTAMP}.sql"

  # Show file size
  FILE_SIZE=$(du -h "exports/${DB_NAME}_${TIMESTAMP}.sql" | cut -f1)
  echo "📊 Size: $FILE_SIZE"

  # Count videos in export
  VIDEO_COUNT=$(grep -c "INSERT INTO \`Video\`" "exports/${DB_NAME}_${TIMESTAMP}.sql")
  echo "🎬 Videos: ~$VIDEO_COUNT insert statements"
else
  echo "❌ Export failed!"
  exit 1
fi
