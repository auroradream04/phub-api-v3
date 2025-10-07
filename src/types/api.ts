// API Response Types

export interface Category {
  id: number;
  name: string;
  videoCount: number;
}

export interface CategoriesResponse {
  categories: Category[];
  total: number;
}

export interface VideoListResult {
  title: string;
  id: string;
  url: string;
  views: string;
  duration: string;
  hd: boolean;
  premium: boolean;
  freePremium: boolean;
  preview: string;
  provider: string;
}

export interface Paging {
  current: number;
  maxPage: number;
  isEnd: boolean;
}

export interface Counting {
  from: number;
  to: number;
  total: number;
}

export interface CategoryVideosResponse {
  data: VideoListResult[];
  paging: Paging;
  counting: Counting;
  category: {
    id: number;
    name: string;
  };
}

export interface ErrorResponse {
  success: false;
  error: string;
}