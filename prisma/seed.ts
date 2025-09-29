import { PrismaClient } from '../src/generated/prisma'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting database seed...')

  const adminEmail = 'admin@example.com'
  const adminPassword = 'admin123'

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail }
  })

  if (existingAdmin) {
    console.log('Admin user already exists')
  } else {
    const hashedPassword = await bcrypt.hash(adminPassword, 10)

    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: 'Admin',
        role: 'admin'
      }
    })

    console.log('Admin user created:', {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role
    })
    console.log('Login credentials:')
    console.log('  Email:', adminEmail)
    console.log('  Password:', adminPassword)
  }

  console.log('Seed completed!')
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })