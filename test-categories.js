#!/usr/bin/env node

// Test script to demonstrate the API endpoints
// Run with: node test-categories.js

const baseUrl = 'http://localhost:4444';

async function testCategoriesEndpoint() {
  console.log('Testing GET /api/categories\n');
  console.log('=' . repeat(50));

  try {
    const response = await fetch(`${baseUrl}/api/categories`);
    const data = await response.json();

    console.log('\nExample API Response:');
    console.log(JSON.stringify(data, null, 2));

    if (data.categories && data.categories.length > 0) {
      console.log('\n\nCategories found:');
      console.log('=' . repeat(50));
      data.categories.forEach((cat, index) => {
        console.log(`${index + 1}. ${cat.name} (ID: ${cat.id}) - ${cat.videoCount} videos`);
      });

      return data.categories[0]?.id; // Return first category ID for testing
    }
  } catch (error) {
    console.error('Error testing categories endpoint:', error.message);
  }
  return null;
}

async function testCategoryVideosEndpoint(categoryId) {
  console.log('\n\nTesting GET /api/videos/category/[categoryId]\n');
  console.log('=' . repeat(50));

  if (!categoryId) {
    console.log('No category ID available for testing');
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/api/videos/category/${categoryId}?page=1`);
    const data = await response.json();

    console.log('\nExample API Response for category', categoryId + ':');
    console.log(JSON.stringify({
      ...data,
      data: data.data ? data.data.slice(0, 2) : [] // Only show first 2 videos for brevity
    }, null, 2));

    if (data.data && data.data.length > 0) {
      console.log(`\nTotal videos in category: ${data.counting?.total || 0}`);
      console.log(`Current page: ${data.paging?.current || 1}`);
      console.log(`Max pages: ${data.paging?.maxPage || 1}`);
    }
  } catch (error) {
    console.error('Error testing category videos endpoint:', error.message);
  }
}

async function main() {
  console.log('\n📋 PornHub Categories API Test\n');

  // Test categories endpoint
  const categoryId = await testCategoriesEndpoint();

  // Test category videos endpoint with the first category
  if (categoryId) {
    await testCategoryVideosEndpoint(categoryId);
  }

  console.log('\n\n✅ Test complete!\n');
}

// Note: Make sure the dev server is running on port 4444
console.log('Note: This test assumes your dev server is running on port 4444');
console.log('Run "npm run dev" first if not already running\n');

main().catch(console.error);