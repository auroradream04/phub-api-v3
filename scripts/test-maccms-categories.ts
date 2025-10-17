import { prisma } from '../src/lib/prisma'
import { getCategoryChineseName, getCanonicalCategory } from '../src/lib/category-mapping'

async function testMaccmsCategories() {
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

  console.log('=== SIMULATED MACCMS API RESPONSE ===\n')

  // Simulate the consolidation logic
  const categoryMap = new Map<string, { typeId: number; typeName: string; count: number }>()

  for (const cat of dbCategories) {
    const normalized = cat.typeName.toLowerCase().trim()

    // Special handling: NEVER consolidate japanese or chinese
    let key: string
    if (normalized === 'japanese' || normalized === 'chinese') {
      key = normalized
    } else {
      key = getCanonicalCategory(cat.typeName)
    }

    const chineseName = getCategoryChineseName(cat.typeName)

    if (categoryMap.has(key)) {
      const existing = categoryMap.get(key)!
      existing.count += cat._count.id
    } else {
      categoryMap.set(key, {
        typeId: cat.typeId,
        typeName: chineseName,
        count: cat._count.id
      })
    }
  }

  const categories = Array.from(categoryMap.values())

  console.log('Total categories returned:', categories.length)
  console.log('\nCategory List:')
  console.log('ID   | Chinese Name      | Video Count')
  console.log('-----|-------------------|------------')

  for (const cat of categories) {
    console.log(
      cat.typeId.toString().padEnd(4) + ' | ' +
      cat.typeName.padEnd(17) + ' | ' +
      cat.count
    )
  }

  await prisma.$disconnect()
}

testMaccmsCategories()
