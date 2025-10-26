#!/bin/bash

echo "==================================="
echo "Testing Maccms API Category Filter"
echo "==================================="

BASE_URL="http://md8av.com"

echo ""
echo "1. Testing no category (should work):"
curl -s "${BASE_URL}/api/maccms/api.php/provide/vod?ac=list&pg=1" | jq -r '{code, total, videos: (.list | length)}' 2>/dev/null || echo "ERROR"

echo ""
echo "2. Testing Asian category (t=3):"
curl -s "${BASE_URL}/api/maccms/api.php/provide/vod?ac=list&t=3&pg=1" | jq -r '{code, total, videos: (.list | length), first: .list[0].vod_name}' 2>/dev/null || echo "ERROR"

echo ""
echo "3. Testing MILF category (t=17):"
curl -s "${BASE_URL}/api/maccms/api.php/provide/vod?ac=list&t=17&pg=1" | jq -r '{code, total, videos: (.list | length), first: .list[0].vod_name}' 2>/dev/null || echo "ERROR"

echo ""
echo "4. Testing category by name (t=asian):"
curl -s "${BASE_URL}/api/maccms/api.php/provide/vod?ac=list&t=asian&pg=1" | jq -r '{code, total, videos: (.list | length)}' 2>/dev/null || echo "ERROR"

echo ""
echo "==================================="
