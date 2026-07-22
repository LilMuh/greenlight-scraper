// Normalized tee-time shape returned by POST /scrape and consumed by the backend.
// This file is the source of truth for the contract; the backend's DTO mirrors it.
export type TeeTime = {
  time: string; // "18:09" (course local)
  date: string; // "2026-07-11"
  course: string; // display name
  holes: number;
  price: number; // green fee per player
  cartPrice: number | null;
  available: boolean;
  minPlayer?: number;
  maxPlayer?: number;
};

// Body of POST /scrape.
export type ScrapeRequest = {
  source: string; // "cps" | "chronogolf"
  site?: string; // provider site/subdomain, when applicable
  courseIds: string[]; // our course slugs
  date: string; // "YYYY-MM-DD"
  holes?: number;
  players?: number;
};
