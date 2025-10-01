import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Middleware function that handles both CORS and auth
function middleware(request: NextRequest) {
  // Handle CORS preflight requests for API routes
  if (request.method === 'OPTIONS' && request.nextUrl.pathname.startsWith('/api/')) {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // Add CORS headers to all API responses
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const response = NextResponse.next()
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
    return response
  }

  // For admin routes, use auth middleware
  return NextResponse.next()
}

// Wrap with auth for admin routes only
export default withAuth(middleware, {
  callbacks: {
    authorized: ({ token, req }) => {
      // Only require auth for admin routes
      if (req.nextUrl.pathname.startsWith('/admin')) {
        return !!token
      }
      return true
    }
  },
  pages: {
    signIn: '/login'
  }
})

export const config = {
  matcher: ['/api/:path*', '/admin/:path*']
}