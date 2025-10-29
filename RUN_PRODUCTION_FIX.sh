#!/bin/bash

##############################################################################
# PRODUCTION FIX SCRIPT
# Fixes typeId/typeName duplicate data corruption
# Safe to run, with dry-run mode available
##############################################################################

set -e  # Exit on any error

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Category Data Corruption Fix - Production Deployment          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we should actually fix or just analyze
DRY_RUN="${1:-true}"  # Default to dry-run unless --fix is passed
if [ "$1" == "--fix" ]; then
  DRY_RUN=false
  echo -e "${YELLOW}⚠️  Running in LIVE mode - will make changes to database${NC}"
  echo ""
  read -p "Are you sure? Type 'yes' to continue: " confirm
  if [ "$confirm" != "yes" ]; then
    echo "Cancelled."
    exit 1
  fi
  echo ""
else
  echo -e "${YELLOW}Running in DRY-RUN mode (no database changes)${NC}"
  echo "To apply changes, run: $0 --fix"
  echo ""
fi

##############################################################################
# STEP 1: VERIFY ENVIRONMENT
##############################################################################
echo -e "${GREEN}[1/5]${NC} Verifying environment..."

if ! command -v npm &> /dev/null; then
  echo -e "${RED}❌ npm not found${NC}"
  exit 1
fi

if [ ! -f ".env.local" ] && [ ! -f ".env" ]; then
  echo -e "${RED}❌ Environment file not found (.env.local or .env)${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Environment verified${NC}"
echo ""

##############################################################################
# STEP 2: ANALYZE ISSUES (DRY-RUN)
##############################################################################
echo -e "${GREEN}[2/5]${NC} Analyzing category data issues..."
echo ""

npm run ts-node -- src/scripts/cleanup-category-duplicates.ts

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

##############################################################################
# STEP 3: BACKUP DATABASE (IF FIXING)
##############################################################################
if [ "$DRY_RUN" == "false" ]; then
  echo -e "${GREEN}[3/5]${NC} Database backup (optional but recommended)"
  echo "Make sure you have backed up your database before continuing!"
  read -p "Have you backed up the database? (yes/no): " backup_confirm

  if [ "$backup_confirm" != "yes" ]; then
    echo "Please backup your database first."
    exit 1
  fi
  echo ""
fi

##############################################################################
# STEP 4: FIX DATABASE (IF NOT DRY-RUN)
##############################################################################
if [ "$DRY_RUN" == "false" ]; then
  echo -e "${GREEN}[4/5]${NC} Running cleanup fix..."
  echo ""

  npm run ts-node -- src/scripts/cleanup-category-duplicates.ts --fix

  echo ""
  echo -e "${GREEN}[5/5]${NC} Applying database migration..."
  echo ""

  npm run migrate

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo -e "${GREEN}✅ PRODUCTION FIX COMPLETE!${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Regenerate types: npm run generate"
  echo "  2. Test the scraper with a small category"
  echo "  3. Monitor logs for errors"
  echo "  4. If issues occur, see CATEGORY_CORRUPTION_FIX.md for rollback"
  echo ""
else
  echo -e "${YELLOW}ℹ️  This was a dry-run analysis${NC}"
  echo ""
  echo "To apply the fixes and update the database, run:"
  echo "  $0 --fix"
  echo ""
  echo "For detailed information, see:"
  echo "  - CATEGORY_CORRUPTION_FIX.md (deployment guide)"
  echo "  - CATEGORY_FIX_SUMMARY.txt (quick reference)"
  echo ""
fi

##############################################################################
# VERIFICATION QUERIES (OPTIONAL)
##############################################################################
if [ "$DRY_RUN" == "false" ]; then
  echo -e "${GREEN}🔍 Verification Queries:${NC}"
  echo ""
  echo "Run these in your database to verify the fix:"
  echo ""
  echo "  1. Check for orphaned categories:"
  echo "     SELECT COUNT(*) FROM Video WHERE typeId NOT IN (SELECT id FROM Category);"
  echo "     Expected: 0"
  echo ""
  echo "  2. Check for mismatched typeNames:"
  echo "     SELECT COUNT(*) FROM Video v"
  echo "     WHERE v.typeName != (SELECT name FROM Category c WHERE c.id = v.typeId);"
  echo "     Expected: 0"
  echo ""
  echo "  3. Check for duplicate category names per typeId:"
  echo "     SELECT COUNT(*) FROM ("
  echo "       SELECT typeId FROM Video GROUP BY typeId"
  echo "       HAVING COUNT(DISTINCT typeName) > 1"
  echo "     ) t;"
  echo "     Expected: 0"
  echo ""
fi
