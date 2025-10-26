// Test script for Maccms API endpoint
// Run with: npx tsx test-maccms-api.ts

const BASE_URL = 'http://md8av.com'

async function testEndpoint(path: string, params: Record<string, string>) {
  const url = new URL(`${BASE_URL}${path}`)
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })

  console.log(`\nTesting: ${url.toString()}`)
  console.log('=' + '='.repeat(79))

  try {
    const response = await fetch(url.toString())
    const contentType = response.headers.get('content-type') || ''

    if (!response.ok) {
      console.error(`Error: ${response.status} ${response.statusText}`)
      const text = await response.text()
      console.error(text)
      return
    }

    if (contentType.includes('xml')) {
      const text = await response.text()
      console.log('XML Response (first 500 chars):')
      console.log(text.substring(0, 500) + '...')
    } else {
      const json = await response.json()
      console.log('JSON Response:')
      console.log({
        code: json.code,
        msg: json.msg,
        page: json.page,
        pagecount: json.pagecount,
        total: json.total,
        videoCount: json.list?.length || 0,
        firstVideo: json.list?.[0] ? {
          id: json.list[0].vod_id,
          name: json.list[0].vod_name,
          pic: json.list[0].vod_pic,
          play_url: json.list[0].vod_play_url?.substring(0, 100) + '...'
        } : null
      })
    }
  } catch (error) {
    console.error('Test failed:', error)
  }
}

async function runTests() {
  console.log('Starting Maccms API Tests')
  console.log('=' + '='.repeat(79))

  // Test 1: List videos (JSON)
  await testEndpoint('/api/maccms/api.php/provide/vod', {
    ac: 'list',
    pg: '1'
  })

  // Test 2: List videos (XML via parameter)
  await testEndpoint('/api/maccms/api.php/provide/vod', {
    ac: 'list',
    pg: '1',
    at: 'xml'
  })

  // Test 3: List videos (XML via path)
  await testEndpoint('/api/maccms/api.php/provide/vod/at/xml', {
    ac: 'list',
    pg: '1'
  })

  // Test 4: Search videos
  await testEndpoint('/api/maccms/api.php/provide/vod', {
    ac: 'list',
    pg: '1',
    wd: 'blonde'
  })

  // Test 5: Get video details (requires valid video ID)
  // Note: Replace 'ph5f3eb3f3e4e3a' with an actual video ID from the list response
  await testEndpoint('/api/maccms/api.php/provide/vod', {
    ac: 'detail',
    ids: 'ph5f3eb3f3e4e3a'
  })

  // Test 6: Filter by category
  await testEndpoint('/api/maccms/api.php/provide/vod', {
    ac: 'list',
    pg: '1',
    t: 'Amateur'
  })

  // Test 7: Filter by recent hours
  await testEndpoint('/api/maccms/api.php/provide/vod', {
    ac: 'list',
    pg: '1',
    h: '24'
  })

  console.log('\n' + '=' + '='.repeat(79))
  console.log('Tests completed!')
}

// Run tests
runTests().catch(console.error)