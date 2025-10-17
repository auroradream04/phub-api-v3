import { prisma } from '../src/lib/prisma'
import { getCanonicalCategory } from '../src/lib/category-mapping'

async function countCategories() {
  const dbCategories = await prisma.video.groupBy({
    by: ['typeId', 'typeName'],
    _count: { id: true },
    where: {
      typeName: { not: '' }
    },
    orderBy: {
      typeId: 'asc'
    }
  })

  console.log('=== CATEGORY CONSOLIDATION REPORT ===\n')
  console.log('Total categories in database:', dbCategories.length)

  const canonicalMap = new Map<string, number>()

  for (const cat of dbCategories) {
    const canonical = getCanonicalCategory(cat.typeName)
    canonicalMap.set(canonical, (canonicalMap.get(canonical) || 0) + 1)
  }

  console.log('Unique categories after consolidation:', canonicalMap.size)
  console.log('Categories reduced by:', dbCategories.length - canonicalMap.size)
  console.log('Reduction percentage:', ((dbCategories.length - canonicalMap.size) / dbCategories.length * 100).toFixed(1) + '%')

  const consolidated = Array.from(canonicalMap.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])

  console.log('\n=== Most Consolidated Categories ===')
  for (const [canonical, count] of consolidated) {
    console.log(`  ${canonical.padEnd(20)} → ${count} variants`)
  }

  await prisma.$disconnect()
}

countCategories()
