import { PrismaClient } from './src/generated/prisma/index.js';
import fs from 'fs';

const prisma = new PrismaClient();

async function exportDatabase() {
  console.log('Exporting database...');
  
  const models = ['user', 'account', 'session', 'verificationToken', 'category', 'video', 'siteSetting', 'domainAd', 'embed'];
  const exportData = {};

  for (const model of models) {
    try {
      const data = await prisma[model].findMany();
      exportData[model] = data;
      console.log(`✓ ${model}: ${data.length} records`);
    } catch (error) {
      console.log(`✗ ${model}: ${error.message}`);
    }
  }

  fs.writeFileSync('/tmp/phub_api_v3_export.json', JSON.stringify(exportData, null, 2));
  console.log('Export complete: /tmp/phub_api_v3_export.json');
  process.exit(0);
}

exportDatabase().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});
