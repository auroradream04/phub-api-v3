#!/bin/bash

# ============================================================
# Verify that export file has production URLs
# ============================================================

if [ -z "$1" ]; then
  # Find the most recent export file
  EXPORT_FILE=$(ls -t exports/*.sql 2>/dev/null | head -1)

  if [ -z "$EXPORT_FILE" ]; then
    echo "❌ No export files found in exports/ directory"
    echo "   Run ./scripts/export-for-prod.sh first"
    exit 1
  fi
else
  EXPORT_FILE="$1"
fi

echo "🔍 Verifying export file: $EXPORT_FILE"
echo ""

# Count localhost URLs (should be 0)
LOCALHOST_COUNT=$(grep -c "localhost:4444" "$EXPORT_FILE" || true)

# Count production URLs (should be many)
PROD_COUNT=$(grep -c "test.md8av.com" "$EXPORT_FILE" || true)

# Show sample URLs
echo "📋 Sample URLs from export:"
grep -o "https://test.md8av.com/api/watch/[^'\"]*" "$EXPORT_FILE" | head -3
echo ""

echo "📊 URL Statistics:"
echo "   Localhost URLs: $LOCALHOST_COUNT"
echo "   Production URLs: $PROD_COUNT"
echo ""

if [ "$LOCALHOST_COUNT" -eq 0 ] && [ "$PROD_COUNT" -gt 0 ]; then
  echo "✅ Export file is correct!"
  echo "   Ready to import to production"
else
  echo "⚠️  Warning: Export may have issues"
  [ "$LOCALHOST_COUNT" -gt 0 ] && echo "   - Found localhost URLs (should be 0)"
  [ "$PROD_COUNT" -eq 0 ] && echo "   - No production URLs found"
fi
