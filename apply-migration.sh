#!/bin/bash

# Apply the migration SQL directly to MySQL
# This adds the foreign key constraint and index

echo "⚠️  Make sure your database is backed up before continuing!"
read -p "Have you backed up the database? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Cancelled."
  exit 1
fi

echo ""
echo "Applying migration SQL..."
echo ""

# Read the migration SQL, skip comments and empty lines
cat prisma/migrations/20241029_add_category_fk_and_fix_duplicates/migration.sql | \
  grep -v '^--' | \
  grep -v '^$' | \
  mysql -h localhost -u root phub_api_v3

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Migration applied successfully!"
  echo ""
  echo "Running verification..."

  # Verify FK constraint was added
  mysql -h localhost -u root phub_api_v3 << EOF
SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_NAME = 'Video'
AND COLUMN_NAME = 'typeId'
AND REFERENCED_TABLE_NAME IS NOT NULL;
EOF

  echo ""
  echo "✅ Done! Foreign key constraint is now active."
else
  echo "❌ Migration failed. Check your database credentials."
  exit 1
fi
