import { NextRequest, NextResponse } from 'next/server'
import { decryptEmbedId } from '@/lib/embed-encryption'

// Cache script for 1 hour
export const revalidate = 3600

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(),
  })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ embedId: string }> }) {
  try {
    const { embedId: encryptedId } = await params

    // Validate encrypted ID can be decrypted
    const embedId = decryptEmbedId(encryptedId)
    if (!embedId) {
      return NextResponse.json({ error: 'Invalid embed ID' }, { status: 400 })
    }

    // Get the origin from the request
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://md8av.com'

    // Generate the embed script
    const script = `
(function() {
  const embedId = '${encryptedId}';
  const apiOrigin = '${origin}';

  // Create container
  const container = document.currentScript?.parentElement || document.body;
  const widget = document.createElement('div');
  widget.id = 'phub-embed-' + embedId;
  widget.style.cssText = 'display:inline-block;width:267px;height:150px;overflow:hidden;border-radius:8px;background:#000;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);';

  // Insert widget
  container.insertBefore(widget, document.currentScript);

  // Fetch widget data
  fetch(apiOrigin + '/api/embed/' + embedId + '/widget')
    .then(r => r.json())
    .then(data => {
      console.log('[Phub Embed] Widget data received:', data);

      if (!data.id) {
        widget.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px;">Embed not found</div>';
        return;
      }

      // Track impression
      fetch(apiOrigin + '/api/embed/' + embedId + '/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'impression',
          referrerDomain: window.location.hostname,
          userAgent: navigator.userAgent
        })
      }).catch(e => {});

      // Display preview or placeholder
      let html = '';

      if (data.previewUrl) {
        // Show video preview - autoplay muted looping
        // Support both m3u8 playlists and direct video files (.webm, .mp4)
        const isM3u8 = data.previewUrl.includes('.m3u8');
        const isWebm = data.previewUrl.includes('.webm');

        let videoType = 'video/mp4';
        if (isM3u8) {
          videoType = 'application/x-mpegURL';
        } else if (isWebm) {
          videoType = 'video/webm';
        }

        html = \`
          <div style="position:relative;width:100%;height:100%;overflow:hidden;border-radius:8px;background:#000;">
            <video
              style="width:100%;height:100%;object-fit:cover;display:block;"
              autoplay
              muted
              loop
              playsinline
            >
              <source src="\${data.previewUrl}" type="\${videoType}" />
              Your browser does not support video playback.
            </video>
          </div>
        \`;
      } else {
        // Final fallback - title only
        html = \`
          <div style="position:relative;width:100%;height:100%;background:#000;overflow:hidden;border-radius:8px;display:flex;align-items:center;justify-content:center;">
            <div style="text-align:center;color:#666;font-size:14px;">
              <div style="margin-bottom:8px;">▶</div>
              <div style="font-size:12px;">\${data.title}</div>
            </div>
          </div>
        \`;
      }

      widget.innerHTML = html;
      widget.style.cursor = 'pointer';

      // Add video error handling
      const videoEl = widget.querySelector('video');
      if (videoEl) {
        videoEl.onerror = (e) => {
          console.error('[Phub Embed] Video load error:', e);
          widget.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px;">Video load error</div>';
        };
        videoEl.onloadeddata = () => {
          console.log('[Phub Embed] Video loaded successfully');
        };
      }

      widget.onclick = (e) => {
        e.stopPropagation();
        // Track click
        fetch(apiOrigin + '/api/embed/' + embedId + '/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventType: 'click',
            referrerDomain: window.location.hostname,
            userAgent: navigator.userAgent
          })
        }).catch(e => {});

        // Navigate to redirect URL
        window.open(data.redirectUrl, '_blank');
      };
    })
    .catch(error => {

      widget.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px;">Failed to load</div>';
    });
})();
`.trim()

    // Return as JavaScript with appropriate headers
    return new NextResponse(script, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=3600',
        ...getCorsHeaders(),
      },
    })
  } catch {
    const errorScript = `// Failed to load embed script`
    return new NextResponse(errorScript, {
      status: 500,
      headers: {
        'Content-Type': 'application/javascript',
        ...getCorsHeaders(),
      },
    })
  }
}
