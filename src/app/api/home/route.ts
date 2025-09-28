import { NextRequest, NextResponse } from 'next/server';
import { PornHub } from 'pornhub.js';
import { getRandomProxy } from '@/lib/proxy';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters
    const pageParam = searchParams.get('page');
    const orderParam = searchParams.get('order');

    // Default to page 1
    const page = pageParam ? parseInt(pageParam, 10) : 1;

    // Default to 'Featured Recently', format like v2
    // Split on '-', capitalize first letter of each word, join with space
    let order = orderParam || 'Featured Recently';
    if (orderParam) {
      order = orderParam
        .split('-')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
        .join(' ');
    }

    // Build options object for pornhub.js
    const options: { page: number; order: string } = {
      page,
      order,
    };

    // Initialize PornHub instance
    const pornhub = new PornHub();

    let videoList;
    let retries = 3;

    // Try without proxy first
    try {
      console.log('[API] Attempting request without proxy...');
      videoList = await pornhub.videoList(options);
    } catch (error) {
      console.error('[API] Request failed without proxy:', error instanceof Error ? error.message : 'Unknown error');
    }

    // If request failed, retry with random proxy (matching v2 logic)
    while ((videoList === undefined || videoList === null || !videoList.data || videoList.data.length < 1) && retries > 0) {
      const proxyAgent = getRandomProxy();

      if (!proxyAgent) {
        console.warn('[API] No proxies available. Cannot retry.');
        break;
      }

      console.log(`[API] Retrying with proxy (${retries} retries remaining)...`);
      pornhub.setAgent(proxyAgent);

      try {
        videoList = await pornhub.videoList(options);
      } catch (error) {
        console.error('[API] Request failed with proxy:', error instanceof Error ? error.message : 'Unknown error');
      }

      retries--;
    }

    // If still no valid data after all retries, throw error
    if (!videoList || !videoList.data || videoList.data.length < 1) {
      throw new Error('Failed to fetch video list after all retries');
    }

    return NextResponse.json(videoList);
  } catch (error) {
    console.error('[API] Error fetching video list:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}