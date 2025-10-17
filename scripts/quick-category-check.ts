import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function quickCheck() {
  try {
    // Get 10 sample videos
    const samples = await prisma.video.findMany({
      take: 10,
      select: {
        vodId: true,
        vodName: true,
        typeId: true,
        typeName: true,
        vodClass: true
      }
    });

    console.log('Sample Videos:');
    console.log(JSON.stringify(samples, null, 2));

    // Get distinct categories
    const categories = await prisma.video.groupBy({
      by: ['typeId', 'typeName'],
      _count: { id: true }
    });

    console.log('\nAll Categories:');
    console.log(JSON.stringify(categories, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

quickCheck();