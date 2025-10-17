import { prisma } from '../src/lib/prisma'
import { getCategoryChineseName } from '../src/lib/category-mapping'

async function listCategories() {
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

  console.log('=== CURRENT CATEGORIES IN DATABASE ===\n')
  console.log('ID   | English Name      | Chinese Name      | Video Count')
  console.log('-----|-------------------|-------------------|------------')

  for (const cat of dbCategories) {
    const chinese = getCategoryChineseName(cat.typeName)
    console.log(
      cat.typeId.toString().padEnd(4) + ' | ' +
      cat.typeName.padEnd(17) + ' | ' +
      chinese.padEnd(17) + ' | ' +
      cat._count.id
    )
  }

  console.log('\nTotal:', dbCategories.length, 'categories')

  await prisma.$disconnect()
}

listCategories()
