/**
 * MACCMS Category Consolidation System
 *
 * This file maps all 200+ database category names to ~10 consolidated categories
 * that are displayed in the public MACCMS API.
 *
 * When a user requests a consolidated category, the API queries for ALL variant
 * database categories that map to it, returning all matching videos.
 */

/**
 * Map from ANY database category name to its consolidated category
 * All 133 database categories are mapped to ensure no videos are left behind
 * 25 main consolidated categories + special handling for Japanese/Chinese
 */
export const DATABASE_TO_CONSOLIDATED: Record<string, string> = {
  // === GAY (consolidated from 30+ gay variants + trans) ===
  'bareback gay': 'gay',
  'massage gay': 'gay',
  'asian gay': 'gay',
  'rough sex gay': 'gay',
  'hunks gay': 'gay',
  'vintage gay': 'gay',
  'straight guys gay': 'gay',
  'public gay': 'gay',
  'reality gay': 'gay',
  'amateur gay': 'gay',
  'handjob gay': 'gay',
  'uncut gay': 'gay',
  'jock gay': 'gay',
  'mature gay': 'gay',
  'webcam gay': 'gay',
  'cumshot gay': 'gay',
  'casting gay': 'gay',
  'pov gay': 'gay',
  'compilation gay': 'gay',
  'chubby gay': 'gay',
  'military gay': 'gay',
  'feet gay': 'gay',
  'cartoon gay': 'gay',
  'tattooed men gay': 'gay',
  'gaming gay': 'gay',
  'closed captions gay': 'gay',
  'verified amateurs gay': 'gay',
  'hd porn gay': 'gay',
  // Trans consolidated into Gay
  'transgender': 'gay',
  'trans with girl': 'gay',
  'trans with guy': 'gay',
  'trans male': 'gay',
  // Muscular Men belongs with Gay
  'muscular men': 'gay',

  // === STRAIGHT (consolidated from heterosexual content) ===
  'asian': 'straight',
  'amateur': 'straight',
  'blonde': 'straight',
  'ebony': 'straight',
  'latina': 'straight',
  'mature': 'straight',
  'milf': 'straight',
  'big tits': 'straight',
  'bbw': 'straight',
  'verified models': 'straight',
  'pornstar': 'straight',
  'casting': 'straight',
  'reality': 'straight',

  // === INTERRACIAL ===
  'interracial': 'interracial',

  // === YOUNG/TEEN (18+ content with young adults) ===
  'babysitter 18': 'young-teen',
  'school 18': 'young-teen',
  'old young 18': 'young-teen',
  'college 18': 'young-teen',
  'college 18 1': 'young-teen',
  '18 25': 'young-teen',

  // === LESBIAN ===
  'lesbian': 'lesbian',
  'scissoring': 'lesbian',

  // === SOLO (self-pleasure) ===
  'solo male': 'solo',
  'solo female': 'solo',
  'masturbation': 'solo',
  'massage': 'solo',
  'gaming': 'solo',

  // === GROUP (orgies, gangbangs, group sex) ===
  'gangbang': 'group',
  'orgy': 'group',
  'ffm': 'group',
  'fmm': 'group',
  'fingering': 'group',

  // === FETISH (BDSM, toys, niche acts) ===
  'bondage': 'fetish',
  'pissing': 'fetish',
  'smoking': 'fetish',
  'feet': 'fetish',
  'handjob': 'fetish',
  'blowjob': 'fetish',
  'fisting': 'fetish',
  'squirt': 'fetish',
  'anal': 'fetish',
  'double penetration': 'fetish',
  'strap on': 'fetish',
  'cumshot': 'fetish',
  'bukkake': 'fetish',
  'pov': 'fetish',
  'pov 1': 'fetish',
  'pussy licking': 'fetish',
  'female orgasm': 'fetish',
  'toys': 'fetish',
  'tattooed women': 'fetish',
  'fetish': 'fetish',
  'role play': 'fetish',
  'parody': 'fetish',
  'step fantasy': 'fetish',
  'cuckold': 'fetish',

  // === KINK (extreme/violent content) ===
  'hardcore': 'kink',

  // === ROUGH SEX ===
  'rough sex': 'rough-sex',

  // === COUNTRY CATEGORIES (individual countries) ===
  'russian': 'russian',
  'indian': 'indian',
  'german': 'german',
  'french': 'french',
  'italian': 'italian',
  'brazilian': 'brazilian',
  'korean': 'korean',
  'arab': 'arab',
  'czech': 'czech',
  'british': 'british',

  // === ANIME (cartoon, hentai, 3d) ===
  'hentai': 'anime',
  'cartoon': 'anime',
  '3d': 'anime',
  '2d': 'anime',
  'sfw': 'anime',
  'podcast': 'anime',

  // === VR (Virtual Reality) ===
  'vr': 'vr',
  'virtual reality 1': 'vr',
  '60fps 1': 'vr',
  '360 1': 'vr',
  '180 1': 'vr',

  // === COSPLAY ===
  'cosplay': 'cosplay',

  // === VERIFIED AMATEURS ===
  'verified amateurs': 'verified-amateurs',

  // === BEHIND THE SCENES ===
  'behind the scenes': 'behind-the-scenes',

  // === SPECIAL FORMATS (other HD/caption formats) ===
  'hd porn': 'special',
  'uncensored': 'special',
  'uncensored 1': 'special',
  'closed captions': 'special',
  'described video': 'special',
  'interactive': 'special',
  'exclusive': 'special',
  'verified couples': 'special',

  // === JAPANESE (SEPARATE - no consolidation) ===
  'japanese': 'japanese',

  // === CHINESE (SEPARATE - no consolidation) ===
  'chinese': 'chinese',

  // === NICHE (everything else) ===
  'celebrity': 'niche',
  'striptease': 'niche',
  'funny': 'niche',
  'romantic': 'niche',
  'popular with women': 'niche',
  'bisexual male': 'niche',
  'public': 'niche',
  'vintage': 'niche',
  'music': 'niche',
};

/**
 * Consolidated categories shown in MACCMS API
 * These are the main categories users see and select from (27 categories)
 */
export const CONSOLIDATED_CATEGORIES = [
  'gay',
  'straight',
  'lesbian',
  'solo',
  'group',
  'fetish',
  'kink',
  'rough-sex',
  'russian',
  'indian',
  'german',
  'italian',
  'french',
  'brazilian',
  'korean',
  'arab',
  'czech',
  'british',
  'interracial',
  'young-teen',
  'anime',
  'vr',
  'cosplay',
  'verified-amateurs',
  'behind-the-scenes',
  'japanese',
  'chinese',
] as const;

/**
 * Mapping from consolidated category to its Chinese display name
 */
export const CONSOLIDATED_TO_CHINESE: Record<string, string> = {
  'gay': '同性恋',
  'straight': '异性恋',
  'lesbian': '女同性恋',
  'solo': '独奏',
  'group': '群交',
  'fetish': '恋物癖',
  'kink': '变态性爱',
  'rough-sex': '粗暴性爱',
  'russian': '俄罗斯',
  'indian': '印度',
  'german': '德国',
  'italian': '意大利',
  'french': '法国',
  'brazilian': '巴西',
  'korean': '韩国',
  'arab': '阿拉伯',
  'czech': '捷克',
  'british': '英国',
  'interracial': '混血',
  'young-teen': '年轻/青少年',
  'anime': '动漫',
  'vr': '虚拟现实',
  'cosplay': '角色扮演',
  'verified-amateurs': '认证业余',
  'behind-the-scenes': '幕后花絮',
  'japanese': '日本',
  'chinese': '中文',
};

/**
 * Map consolidated category to a type_id for MACCMS
 * We assign consistent IDs for API compatibility (1-25)
 */
export const CONSOLIDATED_TYPE_IDS: Record<string, number> = {
  'gay': 1,
  'straight': 2,
  'lesbian': 3,
  'solo': 4,
  'group': 5,
  'fetish': 6,
  'kink': 7,
  'rough-sex': 8,
  'russian': 9,
  'indian': 10,
  'german': 11,
  'italian': 12,
  'french': 13,
  'brazilian': 14,
  'korean': 15,
  'arab': 16,
  'czech': 17,
  'british': 18,
  'interracial': 19,
  'young-teen': 20,
  'anime': 21,
  'vr': 22,
  'cosplay': 23,
  'verified-amateurs': 24,
  'behind-the-scenes': 25,
  'japanese': 26,
  'chinese': 27,
};

/**
 * Get all database categories that belong to a consolidated category
 */
export function getVariantsForConsolidated(consolidated: string): string[] {
  return Object.entries(DATABASE_TO_CONSOLIDATED)
    .filter(([, cat]) => cat === consolidated)
    .map(([dbCat]) => dbCat);
}

/**
 * Get consolidated category for a database category
 */
export function getConsolidatedFromDatabase(dbCategory: string): string {
  const normalized = dbCategory.toLowerCase().trim();
  return DATABASE_TO_CONSOLIDATED[normalized] || 'niche';
}

/**
 * Verify all database categories are mapped
 * Returns unmapped categories for debugging
 */
export function getUnmappedCategories(databaseCategories: string[]): string[] {
  return databaseCategories.filter(
    cat => !DATABASE_TO_CONSOLIDATED[cat.toLowerCase().trim()]
  );
}
