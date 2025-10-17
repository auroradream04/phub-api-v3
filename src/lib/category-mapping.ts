/**
 * English to Chinese category mapping for MACCMS API
 * Based on cn.pornhub.com category names
 */

export const CATEGORY_MAPPING: Record<string, string> = {
  // Your custom categories
  'japanese': '日本',
  'chinese': '中文',

  // Common adult categories
  'amateur': '业余',
  'anal': '肛交',
  'asian': '亚洲',
  'babe': '风情少女',
  'bbw': '大码美女',
  'big-ass': '大屁股',
  'big-dick': '巨屌',
  'big-tits': '大奶',
  'blonde': '金发女',
  'blowjob': '口交',
  'brunette': '黑发女',
  'creampie': '内射',
  'cumshot': '射精',
  'ebony': '黑人',
  'hardcore': '劲爆重口味',
  'hentai': '动漫',
  'latina': '拉丁',
  'lesbian': '女同性恋',
  'milf': '熟女',
  'orgy': '群交',
  'pov': '第一视角',
  'teen': '青少年',
  'threesome': '三人行',
  'pornstar': '色情明星',
  'step-family': '继家庭幻想',
  'hd': '高清色情片',

  // Additional common categories
  'fetish': '恋物癖',
  'gangbang': '轮奸',
  'interracial': '异族',
  'masturbation': '自慰',
  'mature': '成熟',
  'public': '公共场所',
  'reality': '现实',
  'redhead': '红发女',
  'small-tits': '小奶',
  'squirting': '潮吹',
  'toys': '玩具',
  'vintage': '复古',
  'webcam': '网络摄像头',
}

/**
 * Get Chinese name for an English category
 * Returns original name if no mapping found
 */
export function getCategoryChineseName(englishName: string): string {
  // Try exact match first
  const exactMatch = CATEGORY_MAPPING[englishName.toLowerCase()]
  if (exactMatch) return exactMatch

  // Try with spaces replaced by hyphens
  const hyphenated = englishName.toLowerCase().replace(/\s+/g, '-')
  const hyphenMatch = CATEGORY_MAPPING[hyphenated]
  if (hyphenMatch) return hyphenMatch

  // Return original if no mapping found
  return englishName
}

/**
 * Get English name from Chinese category
 * Returns original name if no mapping found
 */
export function getCategoryEnglishName(chineseName: string): string {
  const entry = Object.entries(CATEGORY_MAPPING).find(([, chinese]) => chinese === chineseName)
  return entry ? entry[0] : chineseName
}
