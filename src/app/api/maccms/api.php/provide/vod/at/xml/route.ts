import { NextRequest } from 'next/server'
import { GET as VodHandler } from '../../route'

export const revalidate = 7200 // 2 hours

// This route handles the /api.php/provide/vod/at/xml pattern
// It forwards the request to the main handler with at=xml parameter
export async function GET(request: NextRequest) {
  // Clone the URL and add/override the 'at' parameter
  const url = new URL(request.url)
  url.searchParams.set('at', 'xml')

  // Create a new request with the modified URL
  const modifiedRequest = new NextRequest(url.toString(), {
    method: request.method,
    headers: request.headers,
  })

  // Forward to the main handler
  return VodHandler(modifiedRequest)
}

export async function POST(request: NextRequest) {
  return GET(request)
}