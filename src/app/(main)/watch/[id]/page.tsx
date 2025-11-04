import type { Metadata } from 'next'
import Link from 'next/link'
import { Eye, Clock, User } from 'lucide-react'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getCategoryChineseName } from '@/lib/category-mapping'
import HorizontalAdsSlider from '@/components/HorizontalAdsSlider'
import VideoPreview from '@/components/VideoPreview'
import WatchClient from './watch-client'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params

  try {
    const video = await prisma.video.findUnique({
      where: { vodId: id },
      select: { vodName: true, vodContent: true, vodBlurb: true }
    })

    if (!video) {
      return {
        title: '视频未找到 - MD8AV',
        description: '抱歉，您请求的视频不存在或已被删除。',
      }
    }

    const description = video.vodBlurb || video.vodContent?.substring(0, 160) || `观看 ${video.vodName} - MD8AV提供高质量的视频播放体验`

    return {
      title: `${video.vodName} - MD8AV`,
      description,
      keywords: ['视频播放', '在线观看', video.vodName, 'MD8AV', '高清视频'],
      openGraph: {
        title: video.vodName,
        description,
        type: 'video.other',
      },
    }
  } catch (error) {
    return {
      title: '视频加载中 - MD8AV',
      description: 'MD8AV - 高品质视频内容聚合平台',
    }
  }
}

interface MediaDefinition {
  quality: number
  videoUrl: string
  format: string
}

interface VideoInfo {
  title: string
  views: number
  rating: number
  duration: string
  preview: string
  mediaDefinitions: MediaDefinition[]
  tags?: string[]
  pornstars?: string[]
  provider?: string
  categories?: Array<{ id?: number; name: string }>
}


async function getVideoData(videoId: string) {
  try {
    const video = await prisma.video.findUnique({
      where: { vodId: videoId }
    })

    if (!video) {
      return null
    }

    const videoInfo: VideoInfo = {
      title: video.vodName,
      views: video.views,
      rating: 0,
      duration: video.vodRemarks || '',
      preview: video.vodPic || '',
      mediaDefinitions: [
        {
          quality: 1080,
          videoUrl: `/api/watch/${videoId}/stream.m3u8?q=1080`,
          format: 'hls',
        },
        {
          quality: 720,
          videoUrl: `/api/watch/${videoId}/stream.m3u8?q=720`,
          format: 'hls',
        },
        {
          quality: 480,
          videoUrl: `/api/watch/${videoId}/stream.m3u8?q=480`,
          format: 'hls',
        }
      ],
      tags: [],
      pornstars: video.vodActor ? video.vodActor.split(',').map(a => a.trim()) : [],
      categories: [
        {
          id: video.typeId,
          name: getCategoryChineseName(video.typeName)
        }
      ],
      provider: video.vodProvider || '',
    }

    return videoInfo
  } catch (error) {
    console.error('[Watch Server] Error fetching video:', error)
    return null
  }
}

async function getRecommendedVideos(videoId: string, provider: string) {
  try {
    const videos = await prisma.video.findMany({
      where: {
        vodProvider: provider,
        vodId: { not: videoId }
      },
      select: {
        vodId: true,
        vodName: true,
        vodPic: true,
        vodRemarks: true,
        views: true,
        typeName: true,
        vodProvider: true,
      },
      orderBy: {
        views: 'desc'
      },
      take: 6,
    })

    return videos.map((video) => ({
      id: video.vodId,
      title: video.vodName,
      preview: video.vodPic || '',
      duration: video.vodRemarks || '',
      views: video.views.toString(),
      provider: video.vodProvider || '',
    }))
  } catch (error) {
    console.error('[Watch Server] Error fetching recommendations:', error)
    return []
  }
}

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: videoId } = await params

  const videoInfo = await getVideoData(videoId)

  if (!videoInfo) {
    notFound()
  }

  const recommendedVideos = videoInfo.provider
    ? await getRecommendedVideos(videoId, videoInfo.provider)
    : []

  return (
    <div className="min-h-screen bg-background">
      {/* Video Player Section */}
      <div className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="space-y-6">
          {/* Video Player - Client Component */}
          <WatchClient videoInfo={videoInfo} />

          {/* Horizontal Ads Slider */}
          <HorizontalAdsSlider />

          {/* Video Info */}
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-foreground">
              {videoInfo.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-muted-foreground md:gap-6">
              <span className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                {videoInfo.views?.toLocaleString() || '0'} 次观看
              </span>
              {videoInfo.duration && (
                <span className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  {videoInfo.duration}
                </span>
              )}
              {videoInfo.provider && (
                <span className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  {videoInfo.provider}
                </span>
              )}
            </div>

            {/* Tags */}
            {videoInfo.tags && videoInfo.tags.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">标签:</h3>
                <div className="flex flex-wrap gap-2">
                  {videoInfo.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-card text-foreground text-sm rounded-full border border-border hover:border-primary transition-colors"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Pornstars */}
            {videoInfo.pornstars && videoInfo.pornstars.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">演员:</h3>
                <div className="flex flex-wrap gap-2">
                  {videoInfo.pornstars.map((star, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-primary/10 text-primary text-sm rounded-full border border-primary/20"
                    >
                      {star}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recommended Videos */}
      {recommendedVideos.length > 0 && (
        <section className="py-12 px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              {videoInfo?.provider
                ? `更多来自 ${videoInfo.provider} 的视频`
                : videoInfo?.categories?.[0]?.name
                ? `更多 ${videoInfo.categories[0].name} 分类视频`
                : '推荐视频'}
            </h2>
            <div className="h-1 w-20 bg-gradient-to-r from-primary to-accent rounded-full"></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendedVideos.map((video) => (
              <Link
                key={video.id}
                href={`/watch/${video.id}`}
                className="bg-card rounded-xl overflow-hidden border border-border hover:border-primary transition-all group flex flex-col"
              >
                <VideoPreview
                  preview={video.preview}
                  title={video.title}
                  duration={video.duration}
                  className="group-hover:scale-110 transition-transform duration-300"
                />
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-medium text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors flex-1">
                    {video.title}
                  </h3>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1 leading-none">
                      <Eye className="w-4 h-4" />
                      <span className="leading-none">{video.views}</span>
                    </span>
                    {video.provider && (
                      <span className="flex items-center gap-1 max-w-[120px] leading-none">
                        <User className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate leading-none">{video.provider}</span>
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}