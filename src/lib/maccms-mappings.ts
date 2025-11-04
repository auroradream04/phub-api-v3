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
 */
export const DATABASE_TO_CONSOLIDATED: Record<string, string> = {
  // === GAY (consolidated from 30+ gay variants) ===
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
  'transgender': 'gay',
  'trans with girl': 'gay',
  'trans with guy': 'gay',
  'trans male': 'gay',
  'muscular men': 'gay',

  // === STRAIGHT (consolidated from heterosexual content) ===
  'asian': 'straight',
  'amateur': 'straight',
  'blonde': 'straight',
  'ebony': 'straight',
  'latina': 'straight',
  'interracial': 'straight',
  'mature': 'straight',
  'milf': 'straight',
  'big tits': 'straight',
  'bbw': 'straight',
  'verified amateurs': 'straight',
  'verified models': 'straight',
  'babysitter 18': 'straight',
  'school 18': 'straight',
  'old young 18': 'straight',
  'college 18': 'straight',
  'college 18 1': 'straight',
  'pornstar': 'straight',
  'casting': 'straight',
  'reality': 'straight',
  '18 25': 'straight',

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

  // === FETISH (kink, BDSM, specialty) ===
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
  'role play': 'fetish',
  'cosplay': 'fetish',
  'parody': 'fetish',
  'step fantasy': 'fetish',
  'cuckold': 'fetish',
  'pussy licking': 'fetish',
  'female orgasm': 'fetish',
  'toys': 'fetish',
  'tattooed women': 'fetish',
  'fetish': 'fetish',

  // === KINK (more extreme/rough content) ===
  'rough sex': 'kink',
  'hardcore': 'kink',

  // === INTERNATIONAL (regional content) ===
  'russian': 'international',
  'indian': 'international',
  'german': 'international',
  'french': 'international',
  'italian': 'international',
  'british': 'international',
  'arab': 'international',
  'brazilian': 'international',
  'korean': 'international',
  'czech': 'international',

  // === ANIME (cartoon, hentai, 3d) ===
  'hentai': 'anime',
  'cartoon': 'anime',
  '3d': 'anime',
  '2d': 'anime',
  'sfw': 'anime',
  'podcast': 'anime',

  // === SPECIAL (HD, VR, captions, etc) ===
  'vr': 'special',
  'virtual reality 1': 'special',
  '60fps 1': 'special',
  '360 1': 'special',
  '180 1': 'special',
  'hd porn': 'special',
  'uncensored': 'special',
  'uncensored 1': 'special',
  'closed captions': 'special',
  'closed captions gay': 'special',
  'described video': 'special',
  'interactive': 'special',
  'exclusive': 'special',
  'verified couples': 'special',
  'behind the scenes': 'special',

  // === ASIAN (regional) ===
  'japanese': 'asian',
  'chinese': 'asian',

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
 * These are the main categories users see and select from
 */
export const CONSOLIDATED_CATEGORIES = [
  'gay',
  'straight',
  'lesbian',
  'solo',
  'group',
  'fetish',
  'kink',
  'international',
  'anime',
  'asian',
  'special',
  'niche',
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
  'international': '国际',
  'anime': '动漫',
  'asian': '亚洲',
  'special': '特殊格式',
  'niche': '小众',
};

/**
 * Map consolidated category to a type_id for MACCMS
 * We assign consistent IDs for API compatibility
 */
export const CONSOLIDATED_TYPE_IDS: Record<string, number> = {
  'gay': 1,
  'straight': 2,
  'lesbian': 3,
  'solo': 4,
  'group': 5,
  'fetish': 6,
  'kink': 7,
  'international': 8,
  'anime': 9,
  'asian': 10,
  'special': 11,
  'niche': 12,
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
