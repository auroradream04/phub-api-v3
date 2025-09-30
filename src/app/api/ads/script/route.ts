import { NextResponse } from 'next/server'

const EXTERNAL_ADS_URL = 'https://hcdream.com/berlin/ads/scripts/heiliao.js'

export async function GET() {
  try {
    const response = await fetch(EXTERNAL_ADS_URL, {
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; VideoCenter/1.0)',
      },
    })

    if (!response.ok) {
      console.error('Failed to fetch external ads:', response.status, response.statusText)
      return NextResponse.json({ error: 'Failed to fetch ads' }, { status: 500 })
    }

    const data = await response.json()

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching external ads:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}