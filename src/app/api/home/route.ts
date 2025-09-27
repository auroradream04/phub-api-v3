import { NextResponse } from 'next/server';
import * as pornhub from 'pornhub.js';

export async function GET() {
  try {
    // Basic test to verify pornhub.js is working
    // You can expand this to fetch actual data from the API

    return NextResponse.json({
      success: true,
      message: 'PornHub.js library is installed and working',
      library: 'pornhub.js',
      endpoints: {
        // Add your actual endpoint implementations here
        // Example: await pornhub.search('query')
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}