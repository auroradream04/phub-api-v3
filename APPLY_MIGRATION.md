# Applying the Migration Manually

Since your database already has data, Prisma can't auto-apply the migration. But the good news is that the cleanup script already fixed all the data (34,500 videos corrected!).

Now you just need to add the foreign key constraint and index manually.

## Option 1: Using MySQL CLI

```bash
# Connect to your MySQL database and run these commands:

-- Add foreign key constraint
ALTER TABLE `Video`
ADD CONSTRAINT `Video_typeId_fkey`
FOREIGN KEY (`typeId`)
REFERENCES `Category`(`id`)
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- Add index for faster queries
CREATE INDEX `Video_typeId_typeName_idx` ON `Video`(`typeId`, `typeName`);
```

## Option 2: Using Prisma Studio (GUI)

```bash
npx prisma studio
# Then run the SQL in the "Raw Database" tab
```

## Option 3: Run SQL File

If you have mysql CLI installed:

```bash
mysql -h localhost -u root -p phub_api_v3 < /path/to/migration.sql
```

## Verification

After applying, verify the constraint was added:

```sql
SELECT CONSTRAINT_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_NAME = 'Video'
AND COLUMN_NAME = 'typeId'
AND REFERENCED_TABLE_NAME IS NOT NULL;
```

Should return: `Video_typeId_fkey`

## Status

✅ Code fix applied (upsert now updates typeId/typeName)
✅ Data cleanup complete (34,500 videos fixed)
⏳ Foreign key constraint (pending - manual SQL)
⏳ Index (pending - manual SQL)

Once you run the SQL above, everything will be complete!
