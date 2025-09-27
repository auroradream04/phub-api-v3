import { NextRequest, NextResponse } from 'next/server';
import { PornHub } from 'pornhub.js';

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
    const options: any = {
      page,
      order,
    };

    // Initialize PornHub instance
    const pornhub = new PornHub();

    // Fetch video list from PornHub
    const videoList = await pornhub.videoList(options);

    return NextResponse.json(videoList);
  } catch (error) {
    console.error('Error fetching video list:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}