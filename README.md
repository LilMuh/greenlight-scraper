# greenlight-scraper

Fetches golf tee-time availability and normalizes every booking system into one
shape, for **GreenLight**
([greenlight-frontend](https://github.com/LilMuh/greenlight-frontend) is the
project front page).

The scraper is stateless: the backend tells it what to fetch, it returns
normalized results. It never touches the database.

> Current status: **CPS source working** (golfvancouver — Fraserview / Langara /
> McCleery), via the browser service below. More sources (ChronoGolf) to come.

## Run

```bash
npm install
cp .env.example .env   # fill in BROWSER_PROFILE_ID
npm run dev            # http://localhost:8090
```

`.env` is loaded automatically (Node `--env-file`).

## HTTP API

| Method | Path | Returns |
| --- | --- | --- |
| `GET` | `/health` | `{ "status": "ok" }` |
| `GET` | `/courses` | course catalog: `[{ id, name, source, site }]` |
| `POST` | `/scrape` | `{ source, site, date, count, teeTimes: TeeTime[] }` |

`POST /scrape` body — omit `courseIds` to scrape every course for that source/site.
One request = one browser navigation covering all requested courses:

```json
{ "source": "cps", "site": "golfvancouver", "courseIds": ["fraserview", "langara"], "date": "2026-07-25", "holes": 18, "players": 4 }
```

`TeeTime` shape (see `src/types.ts` — the source of truth for this contract):

```ts
{ courseId, time, date, course, holes, price, cartPrice, available, minPlayer?, maxPlayer? }
```

## Layout

```
src/
  index.ts              HTTP server (/health, /courses, /scrape)
  types.ts              TeeTime / ScrapeRequest contract
  model/                course catalog (slug ↔ provider ids)
  sources/              per-provider scraping (cps.ts) + dispatcher
  browser/              CDP client + fingerprint-browser driver
```

## Browser service

Some booking systems sit behind anti-bot protection and can't be reached with a
plain HTTP client. For those, GreenLight drives a **fingerprint browser service
that exposes the Chrome DevTools Protocol (CDP)**, loads the booking page, and
reads the site's own authenticated API response.

The scraper connects to any compatible CDP browser service via environment
variables (`BROWSER_SERVICE_URL`, `BROWSER_PROFILE_ID`, `BROWSER_API_KEY`) — see
`.env.example`. You bring your own service; one open-source option is
[Open-Anti-Browser](https://github.com/Wtcity22/Open-Anti-Browser.git). No
service details or credentials are committed to this repo.
