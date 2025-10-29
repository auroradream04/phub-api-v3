# Database Export Scripts

Scripts to export your local database for production deployment.

## 🚀 Quick Start (Recommended)

```bash
# Run the all-in-one script
./scripts/export-for-prod.sh
```

This script automatically:
1. ✅ Replaces `localhost:4444` → `test.md8av.com`
2. ✅ Exports database to `exports/phub_api_v3_TIMESTAMP.sql`
3. ✅ Reverts URLs back to `localhost:4444` (so your local dev still works)

**Your local database is unchanged after running this!**

---

## 📋 Manual Steps (if you prefer)

### Step 1: Replace localhost URLs

```bash
mysql -u root -p phub_api_v3 < scripts/1-prepare-for-export.sql
```

This replaces:
- `http://localhost:4444` → `https://test.md8av.com`
- `http://localhost:3000` → `https://test.md8av.com`

### Step 2: Export database

```bash
./scripts/2-export-database.sh
```

Creates: `exports/phub_api_v3_TIMESTAMP.sql`

### Step 3: Revert to localhost

```bash
mysql -u root -p phub_api_v3 < scripts/3-revert-to-localhost.sql
```

This reverts:
- `https://test.md8av.com` → `http://localhost:4444`

---

## 📤 Deploying to Production

After exporting:

```bash
# Upload to server
scp exports/phub_api_v3_*.sql user@test.md8av.com:/tmp/

# SSH to server
ssh user@test.md8av.com

# Import database
mysql -u root -p phub_api_v3 < /tmp/phub_api_v3_*.sql
```

---

## 🔧 Troubleshooting

### "Access denied for user"

Check your `.env` file has correct `DATABASE_URL`:
```
DATABASE_URL="mysql://root:password@localhost:3306/phub_api_v3"
```

### "mysqldump: command not found"

Install MySQL client:
```bash
# macOS
brew install mysql-client

# Ubuntu/Debian
sudo apt-get install mysql-client
```

### Export file is huge

That's normal! A database with 10,000 videos = ~50-100MB SQL file.

To compress:
```bash
gzip exports/phub_api_v3_*.sql
# Creates: phub_api_v3_*.sql.gz
```

---

## 📊 What Gets Exported

- ✅ All videos
- ✅ All categories
- ✅ All users
- ✅ All settings
- ✅ All ads
- ✅ Database structure (tables, indexes, constraints)

---

## ⚠️ Important Notes

1. **Local dev still works**: The script reverts URLs automatically
2. **No data loss**: Original database is never deleted
3. **Export file location**: `exports/` directory (gitignored)
4. **Timestamps**: Each export has unique timestamp
5. **Production domain**: Change `test.md8av.com` in scripts if needed

---

## 🎯 Example Output

```
================================================
🚀 Database Export for Production
================================================

📍 Database: phub_api_v3
🌐 Host: localhost:3306

📝 Step 1: Replacing localhost URLs with production URLs...
✅ Updated 1,234 videos

📦 Step 2: Exporting database...
✅ Export successful: exports/phub_api_v3_20250130_143022.sql (45M)

🔄 Step 3: Reverting URLs back to localhost...
✅ Reverted 1,234 videos to localhost

================================================
✅ Export Complete!
================================================

📁 File: exports/phub_api_v3_20250130_143022.sql
📊 Size: 45M

🚀 Next steps:
   1. Upload exports/phub_api_v3_20250130_143022.sql to production server
   2. Import: mysql -u USER -p DATABASE < exports/phub_api_v3_20250130_143022.sql

💡 Your local database URLs are back to localhost
================================================
```
