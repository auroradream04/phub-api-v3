import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeCategories() {
  try {
    console.log('=== CATEGORY ANALYSIS REPORT ===\n');

    // 1. Get sample videos to see how categories are stored
    console.log('1. SAMPLE VIDEO DATA (first 5 videos):');
    console.log('----------------------------------------');
    const sampleVideos = await prisma.video.findMany({
      take: 5,
      select: {
        vodId: true,
        vodName: true,
        typeId: true,
        typeName: true,
        vodClass: true
      }
    });

    sampleVideos.forEach(video => {
      console.log(`Video: ${video.vodName.substring(0, 50)}...`);
      console.log(`  - vodId: ${video.vodId}`);
      console.log(`  - typeId: ${video.typeId}`);
      console.log(`  - typeName: ${video.typeName}`);
      console.log(`  - vodClass: ${video.vodClass}`);
      console.log('');
    });

    // 2. Get distinct typeName values with counts
    console.log('\n2. DISTINCT TYPE NAMES (Primary Categories):');
    console.log('---------------------------------------------');
    const typeNames = await prisma.video.groupBy({
      by: ['typeId', 'typeName'],
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      }
    });

    console.log('TypeID | TypeName | Video Count');
    console.log('-------|----------|------------');
    typeNames.forEach(cat => {
      console.log(`${cat.typeId.toString().padEnd(6)} | ${cat.typeName.padEnd(25)} | ${cat._count.id}`);
    });

    // 3. Analyze vodClass field (secondary categories)
    console.log('\n3. VODCLASS ANALYSIS (All Categories):');
    console.log('---------------------------------------');

    // Get all unique vodClass values
    const vodClasses = await prisma.video.findMany({
      select: {
        vodClass: true
      },
      where: {
        vodClass: {
          not: null
        }
      }
    });

    // Parse and count all categories
    const categoryMap = new Map<string, number>();
    vodClasses.forEach(video => {
      if (video.vodClass) {
        const categories = video.vodClass.split(',').map(c => c.trim());
        categories.forEach(cat => {
          if (cat) {
            categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
          }
        });
      }
    });

    // Sort by count and display
    const sortedCategories = Array.from(categoryMap.entries())
      .sort((a, b) => b[1] - a[1]);

    console.log('Top 20 categories from vodClass:');
    console.log('Category Name | Occurrence Count');
    console.log('--------------|------------------');
    sortedCategories.slice(0, 20).forEach(([cat, count]) => {
      console.log(`${cat.padEnd(35)} | ${count}`);
    });

    console.log(`\nTotal unique categories in vodClass: ${sortedCategories.length}`);

    // 4. Check for custom categories
    console.log('\n4. CUSTOM CATEGORIES CHECK:');
    console.log('----------------------------');
    const customCategories = ['japanese', 'chinese', 'asian'];

    for (const cat of customCategories) {
      // Check in typeName
      const inTypeName = await prisma.video.count({
        where: {
          typeName: {
            contains: cat,
          }
        }
      });

      // Check in vodClass
      const inVodClass = await prisma.video.count({
        where: {
          vodClass: {
            contains: cat,
          }
        }
      });

      console.log(`"${cat}":`);
      console.log(`  - In typeName: ${inTypeName} videos`);
      console.log(`  - In vodClass: ${inVodClass} videos`);
    }

    // 5. Check typeId consistency
    console.log('\n5. TYPEID CONSISTENCY CHECK:');
    console.log('-----------------------------');

    // Group by typeId and check for multiple typeNames
    const typeIdGroups = await prisma.video.groupBy({
      by: ['typeId'],
      _count: {
        typeName: true
      }
    });

    // For each typeId, get distinct typeNames
    let inconsistentCount = 0;
    for (const group of typeIdGroups.slice(0, 10)) {
      const typeNames = await prisma.video.findMany({
        where: { typeId: group.typeId },
        select: { typeName: true },
        distinct: ['typeName']
      });

      if (typeNames.length > 1) {
        inconsistentCount++;
        console.log(`⚠️  TypeId ${group.typeId} has multiple names: ${typeNames.map(t => t.typeName).join(', ')}`);
      }
    }

    if (inconsistentCount === 0) {
      console.log('✅ All checked typeIds have consistent typeNames');
    }

    // 6. Null/Empty check
    console.log('\n6. NULL/EMPTY VALUE CHECK:');
    console.log('---------------------------');
    const nullTypeName = await prisma.video.count({
      where: {
        OR: [
          { typeName: null },
          { typeName: '' }
        ]
      }
    });

    const nullVodClass = await prisma.video.count({
      where: {
        OR: [
          { vodClass: null },
          { vodClass: '' }
        ]
      }
    });

    const totalVideos = await prisma.video.count();
    console.log(`Total videos: ${totalVideos}`);
    console.log(`Videos with null/empty typeName: ${nullTypeName}`);
    console.log(`Videos with null/empty vodClass: ${nullVodClass}`);

    // 7. Sample SQL queries for extraction
    console.log('\n7. RECOMMENDED EXTRACTION APPROACH:');
    console.log('-----------------------------------');
    console.log('Option 1: Use typeName as primary category (simpler, one category per video)');
    console.log('Option 2: Parse vodClass for all categories (more comprehensive)');
    console.log('Option 3: Combine both - typeName as primary, vodClass for tags\n');

    console.log('RECOMMENDED PRISMA QUERY FOR MACCMS API:');
    console.log('```typescript');
    console.log(`
// Get all distinct categories with counts
const categories = await prisma.video.groupBy({
  by: ['typeId', 'typeName'],
  _count: { id: true },
  where: {
    typeName: {
      not: ''
    }
  },
  orderBy: [
    { _count: { id: 'desc' } }
  ]
});

// Transform to MacCMS format
const categoryList = categories.map(cat => ({
  type_id: cat.typeId,
  type_name: cat.typeName,
  type_en: cat.typeName.toLowerCase().replace(/\\s+/g, '-'),
  type_count: cat._count.id
}));
    `);
    console.log('```');

    // 8. Show category mapping suggestion
    console.log('\n8. CATEGORY ID MAPPING:');
    console.log('------------------------');
    const top10Categories = typeNames.slice(0, 10);
    console.log('Top 10 categories by video count:');
    top10Categories.forEach((cat, index) => {
      console.log(`${index + 1}. ID: ${cat.typeId} => "${cat.typeName}" (${cat._count.id} videos)`);
    });

  } catch (error) {
    console.error('Error analyzing categories:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeCategories();