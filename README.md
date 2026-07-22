# greenlight-scraper

Fetches golf tee-time availability and normalizes every booking system into one
shape, for **GreenLight**
([greenlight-frontend](https://github.com/LilMuh/greenlight-frontend) is the
project front page).

The scraper is stateless: the backend tells it what to fetch, it returns
normalized results. It never touches the database.

> Current status: minimal skeleton. The HTTP endpoints are stubbed; the actual
> fetching (curl fingerprint + browser intercept) is added next.

## Run

```bash
npm install
npm run dev        # http://localhost:8090
```

## HTTP API

| Method | Path | Returns |
| --- | --- | --- |
| `GET` | `/health` | `{ "status": "ok" }` |
| `GET` | `/courses` | course catalog: `[{ id, name, source, site }]` |
| `POST` | `/scrape` | `{ "teeTimes": TeeTime[] }` |

`POST /scrape` body:

```json
{ "source": "cps", "site": "golfvancouver", "courseIds": ["fraserview"], "date": "2026-07-11", "holes": 18, "players": 4 }
```

`TeeTime` shape (see `src/types.ts` — the source of truth for this contract):

```ts
{ time, date, course, holes, price, cartPrice, available, minPlayer?, maxPlayer? }
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
