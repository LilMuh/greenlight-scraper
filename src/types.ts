// Normalized tee-time shape returned by POST /scrape and consumed by the backend.
// This file is the source of truth for the contract; the backend's DTO mirrors it.
export type TeeTime = {
  courseId: string; // our course slug, e.g. "fraserview"
  time: string; // "18:09" (course local)
  date: string; // "2026-07-11"
  course: string; // display name
  holes: number;
  price: number; // green fee per player
  cartPrice: number | null;
  available: boolean; // seen bookable this round (available_seats > 0)
  availableSeats: number; // real open seats for this slot, 0–4 (CPS maxPlayer)
};

// Body of POST /scrape.
export type ScrapeRequest = {
  source: string; // "cps" (more sources later)
  site?: string; // provider site/subdomain, when applicable (e.g. "golfvancouver")
  courseIds?: string[]; // our course slugs; omit to scrape every configured course for the source/site
  date: string; // "YYYY-MM-DD"
  holes?: number;
  // 顺带去 Google Maps 刷新这些球场的地址/评分。谁过期了由后端判断（它拥有 course 表），
  // 这里只管抓；省略或空数组 = 这一趟不查 maps。
  refreshCourses?: CourseRefreshRequest[];
};

// 一个要刷新的球场。mapsUrl 是上次解析到的地点链接，有就直接导航过去、不再搜索。
export type CourseRefreshRequest = {
  slug: string;
  name: string;
  mapsUrl?: string | null;
};

// 从 Google Maps 取到的球场信息。每个字段独立可空——取不到就是 null，绝不填猜的值。
// 写库归后端：scraper 只把抓到的东西原样交回去。
export type CourseInfo = {
  slug: string;
  address: string | null;
  rating: number | null; // 0.0–5.0
  ratingCount: number | null;
  mapsUrl: string | null;
};

export type ScrapeResponse = {
  source: string;
  site?: string;
  date: string;
  count: number;
  teeTimes: TeeTime[];
  courseInfos: CourseInfo[]; // 没让刷新时是空数组
};
