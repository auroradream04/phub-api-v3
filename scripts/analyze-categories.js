const { PrismaClient } = require('@prisma/client');

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
    const categoryMap = new Map();
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
            mode: 'insensitive'
          }
        }
      });

      // Check in vodClass
      const inVodClass = await prisma.video.count({
        where: {
          vodClass: {
            contains: cat,
            mode: 'insensitive'
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
    const typeIdConsistency = await prisma.$queryRaw`
      SELECT typeId, GROUP_CONCAT(DISTINCT typeName) as names, COUNT(DISTINCT typeName) as name_count
      FROM Video
      GROUP BY typeId
      HAVING name_count > 1
      LIMIT 10
    `;

    if (typeIdConsistency.length > 0) {
      console.log('⚠️  Found typeIds with multiple typeNames:');
      typeIdConsistency.forEach(row => {
        console.log(`  TypeId ${row.typeId}: ${row.names}`);
      });
    } else {
      console.log('✅ All typeIds have consistent typeNames');
    }

    // 6. Null/Empty check
    console.log('\n6. NULL/EMPTY VALUE CHECK:');
    console.log('---------------------------');
    const nullChecks = await prisma.video.aggregate({
      _count: {
        id: true
      },
      where: {
        OR: [
          { typeName: null },
          { typeName: '' },
          { vodClass: null },
          { vodClass: '' }
        ]
      }
    });

    const totalVideos = await prisma.video.count();
    console.log(`Total videos: ${totalVideos}`);
    console.log(`Videos with null/empty typeName or vodClass: ${nullChecks._count.id}`);

    // 7. Sample SQL queries for extraction
    console.log('\n7. RECOMMENDED EXTRACTION QUERIES:');
    console.log('-----------------------------------');
    console.log('// Get all distinct primary categories:');
    console.log(`
const categories = await prisma.video.groupBy({
  by: ['typeId', 'typeName'],
  _count: { id: true },
  orderBy: { _count: { id: 'desc' } }
});
    `);

    console.log('// Get all categories from vodClass (parsed):');
    console.log(`
const videos = await prisma.video.findMany({
  select: { vodClass: true },
  where: { vodClass: { not: null } }
});

const categorySet = new Set();
videos.forEach(v => {
  if (v.vodClass) {
    v.vodClass.split(',').forEach(cat => {
      if (cat.trim()) categorySet.add(cat.trim());
    });
  }
});

const allCategories = Array.from(categorySet).sort();
    `);

  } catch (error) {
    console.error('Error analyzing categories:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeCategories();