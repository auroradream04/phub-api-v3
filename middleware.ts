import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET
  })

  // Protect admin routes
  if (
    request.nextUrl.pathname.startsWith('/api/admin') ||
    request.nextUrl.pathname.startsWith('/admin')
  ) {
    if (!token || token.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required' },
        { status: 403 }
      )
    }
  }

  // Protect scraper routes
  if (request.nextUrl.pathname.startsWith('/api/scraper')) {
    if (!token || token.role !== 'admin') {
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
