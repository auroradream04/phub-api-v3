import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { PrismaClient } from '@/generated/prisma'

const prisma = new PrismaClient()

// GET all settings
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let settings = await prisma.siteSetting.findMany({
      orderBy: { key: 'asc' }
    })

    // If no settings exist, create defaults
    if (settings.length === 0) {
      const defaultSettings = [
        { key: 'cors_proxy_enabled', value: 'true' },
        { key: 'cors_proxy_url', value: 'https://cors.freechatnow.net/' },
        { key: 'ads_script_url', value: 'https://hcdream.com/berlin/ads/script.js' },
        { key: 'auto_translate_titles', value: 'true' },
        { key: 'scraper_min_duration', value: '60' },
        { key: 'scraper_min_views', value: '10000' },
        { key: 'segments_to_skip', value: '3' },
      ]

      await Promise.all(
        defaultSettings.map(setting =>
          prisma.siteSetting.create({ data: setting })
        )
      )

      settings = await prisma.siteSetting.findMany({
        orderBy: { key: 'asc' }
      })
    }

    return NextResponse.json(settings)
  } catch (error) {

    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

// PUT (update) settings
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { settings } = await request.json()

    if (!Array.isArray(settings)) {
      return NextResponse.json({ error: 'Invalid settings format' }, { status: 400 })
    }

    // Update each setting
    await Promise.all(
      settings.map(async (setting: { key: string; value: string }) => {
        await prisma.siteSetting.update({
          where: { key: setting.key },
          data: { value: setting.value }
        })
      })
    )

    return NextResponse.json({ success: true })
  } catch (error) {

    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}