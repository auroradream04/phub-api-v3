import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

export async function middleware(request: NextRequest) {
  const session = await getServerSession(authOptions)

  // Protect admin routes
  if (
    request.nextUrl.pathname.startsWith('/api/admin') ||
    request.nextUrl.pathname.startsWith('/admin')
  ) {
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required' },
        { status: 403 }
      )
    }
  }

  // Protect scraper routes
  if (request.nextUrl.pathname.startsWith('/api/scraper')) {
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required' },
        { status: 403 }
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/admin/:path*',
    '/api/scraper/:path*',
    '/admin/:path*'
  ]
}
