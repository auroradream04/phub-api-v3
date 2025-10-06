# Maccms API Documentation

This API provides video data in Maccms-compatible format, allowing integration with Maccms-based applications and players.

## Endpoints

### Primary Endpoint
- **URL:** `/api/maccms/api.php/provide/vod`
- **Method:** `GET` or `POST`
- **Description:** Main endpoint for fetching video lists and details

### XML Endpoint (Alternative)
- **URL:** `/api/maccms/api.php/provide/vod/at/xml`
- **Method:** `GET` or `POST`
- **Description:** Forces XML response format

## Parameters

| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| `ac` | string | Yes | Action type: `list` or `detail` | - |
| `t` | string | No | Category/type filter | - |
| `pg` | integer | No | Page number | 1 |
| `wd` | string | No | Search keyword | - |
| `h` | integer | No | Filter by recent hours (24, 168, 720) | - |
| `ids` | string | No | Comma-separated video IDs for detail action | - |
| `at` | string | No | Response format: `xml` or empty for JSON | - |

## Response Formats

### JSON Response (Default)

```json
{
  "code": 1,
  "msg": "数据列表",
  "page": 1,
  "pagecount": 100,
  "limit": "20",
  "total": 2000,
  "list": [
    {
      "vod_id": "ph123456",
      "vod_name": "Video Title",
      "type_id": 1,
      "type_name": "Adult",
      "vod_en": "video-title",
      "vod_time": "2024-01-01 12:00:00",
      "vod_remarks": "12:34",
      "vod_play_from": "YourAPI",
      "vod_pic": "https://example.com/thumb.jpg",
      "vod_area": "US",
      "vod_lang": "en",
      "vod_year": "2024",
      "vod_actor": "actor1,actor2",
      "vod_director": "",
      "vod_content": "tag1, tag2, tag3",
      "vod_play_url": "Full Video$http://yourapi.com/api/watch/ph123456/stream?q=720"
    }
  ],
  "class": [
    {"type_id": 1, "type_name": "Adult"}
  ]
}
```

### XML Response (when at=xml)

```xml
<?xml version="1.0" encoding="utf-8"?>
<rss version="1.0">
  <list page="1" pagecount="100" pagesize="20" recordcount="2000">
    <video>
      <last>2024-01-01 12:00:00</last>
      <id>ph123456</id>
      <tid>1</tid>
      <name><![CDATA[Video Title]]></name>
      <type>Adult</type>
      <pic><![CDATA[https://example.com/thumb.jpg]]></pic>
      <lang>en</lang>
      <area>US</area>
      <year>2024</year>
      <state>12:34</state>
      <note>12:34</note>
      <actor><![CDATA[actor1,actor2]]></actor>
      <director><![CDATA[]]></director>
      <dl>
        <dd flag="YourAPI"><![CDATA[Full Video$http://yourapi.com/api/watch/ph123456/stream?q=720]]></dd>
      </dl>
      <des><![CDATA[tag1, tag2, tag3]]></des>
    </video>
  </list>
  <class>
    <ty id="1">Adult</ty>
  </class>
</rss>
```

## Usage Examples

### 1. Get Video List (JSON)
```bash
GET /api/maccms/api.php/provide/vod?ac=list&pg=1
```

### 2. Get Video List (XML)
```bash
GET /api/maccms/api.php/provide/vod?ac=list&pg=1&at=xml
# or
GET /api/maccms/api.php/provide/vod/at/xml?ac=list&pg=1
```

### 3. Search Videos
```bash
GET /api/maccms/api.php/provide/vod?ac=list&wd=blonde&pg=1
```

### 4. Get Video Details
```bash
GET /api/maccms/api.php/provide/vod?ac=detail&ids=ph123456,ph789012
```

### 5. Filter by Category
```bash
GET /api/maccms/api.php/provide/vod?ac=list&t=Amateur&pg=1
```

### 6. Filter by Recent Hours
```bash
# Videos from last 24 hours
GET /api/maccms/api.php/provide/vod?ac=list&h=24&pg=1

# Videos from last week
GET /api/maccms/api.php/provide/vod?ac=list&h=168&pg=1
```

## Field Mappings

| Maccms Field | Source Data | Description |
|--------------|-------------|-------------|
| `vod_id` | video.video_id or video.key | Unique video identifier |
| `vod_name` | video.title | Video title |
| `vod_pic` | video.thumb | Thumbnail URL |
| `vod_time` | video.publish_date | Upload date/time |
| `vod_remarks` | video.duration | Duration or "HD" |
| `vod_year` | Extracted from publish_date | Publication year |
| `vod_actor` | video.pornstars | Comma-separated actors |
| `vod_content` | video.tags or categories | Video tags/categories |
| `vod_play_url` | Generated stream URL | Playable video URL |
| `vod_play_from` | "YourAPI" | Source identifier |

## Response Codes

| Code | Description |
|------|-------------|
| 1 | Success |
| 0 | Error |

## Error Handling

### JSON Error Response
```json
{
  "code": 0,
  "msg": "Error message",
  "error": "Error details"
}
```

### XML Error Response
```xml
<?xml version="1.0" encoding="utf-8"?>
<rss version="1.0">
  <list page="1" pagecount="0" pagesize="20" recordcount="0">
  </list>
  <class>
    <ty id="1">Adult</ty>
  </class>
</rss>
```

## Rate Limiting

The API uses proxy rotation to handle rate limiting from the source. If requests fail, they are automatically retried with different proxies.

## Performance Considerations

- **Page Size:** Fixed at 20 videos per page
- **Caching:** Results are not cached by default
- **Proxy Rotation:** Automatic retry with proxy on failure
- **Timeout:** Standard Next.js timeout applies

## Integration with Maccms

To integrate this API with your Maccms installation:

1. Log in to your Maccms admin panel
2. Navigate to "Resource Collection" or "API Integration"
3. Add a new API source with the following settings:
   - **API URL:** `http://yourapi.com/api/maccms/api.php/provide/vod`
   - **Response Format:** JSON or XML (based on preference)
   - **Collection Method:** Standard
4. Test the connection
5. Set up automatic collection schedules if needed

## Security Notes

- The API uses proxy rotation for anonymity
- No authentication required (public API)
- CORS headers are configured for cross-origin access
- Internal errors are not exposed in responses