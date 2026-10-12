# TikTok Profile Scraper & Creator Growth Monitor

Compare public TikTok profiles for influencer research, creator vetting and campaign reporting. Export available follower, like and video-count statistics, then reuse a named watchlist to measure observed growth, posting pace and profile changes for creator and brand analysis.

The Actor reads TikTok's public embedded profile payload through bounded HTTP sessions. If TikTok challenges the detailed profile page, it falls back to TikTok's official public oEmbed metadata. The `profile-scraped` result event is charged only after a profile record is successfully saved; the separate Actor Start fee still applies.

## What It Extracts

- Username, display name, biography, and profile URL
- Followers, following, total likes, and video count
- Verification, privacy, and region signals
- Public website in bio and profile image URL
- Collection timestamp
- Optional persistent growth status: baseline, updated, unchanged, or partial
- Follower, total-like, and video-count deltas against the previous detailed observation
- Follower growth percentage, followers per day, likes per day, and posting pace
- Likes gained per new video and signals for spikes, declines, new videos, profile edits, or verification changes

## Persistent Creator Growth Monitoring

Enable `trackGrowth`, choose a stable `monitorName`, and schedule the same creator list. The first detailed observation becomes the baseline. Later profile rows include deltas and time-normalized growth velocity against the latest detailed observation in that named watchlist.

Every successful observation remains one normal `profile-scraped` event. There is no extra monitoring event. The Actor intentionally does not suppress unchanged profiles: scheduled observations are the evidence needed for a complete time series, and charging the normal row keeps the low-volume monitoring workflow sustainable.

If TikTok exposes only identity data through its official oEmbed fallback, `dataQuality` is `identity-only` and `trackingStatus` is `partial`. That observation is retained, but missing counts do not overwrite the most recent detailed baseline or create false growth alerts.

Every successful run also writes:

- `OUTPUT` — compact run totals and monitoring-state counts
- `MONITORING-REPORT` — JSON summary with data-quality coverage, deltas, posting pace, and signal counts
- `MONITORING-REPORT.csv` — formula-safe spreadsheet export for watchlists and campaign reporting

These reports are included in the normal profile price; there is no separate reporting or monitoring fee.

## Pricing: Profile Results + Actor Start

The Actor uses Pay Per Event pricing:

| Event | Price |
| --- | ---: |
| `profile-scraped` | `$0.002` per successfully saved profile, or `$2.00` per 1,000 |
| `apify-actor-start` | `$0.00005` per GB when the Actor starts, minimum one event |

Failed requests and profiles that are not saved do not trigger `profile-scraped`. A successfully saved identity-only oEmbed fallback is still one profile event; it is marked `partial` and does not promise complete statistics. Profiles already saved before a partial failure retain their normal result charges.

The Actor Start fee can still apply to empty or failed runs. Apify counts one start event per GB of memory, with at least one event; at the unchanged 256 MB default, that is `$0.00005` for the start event. Reports and growth comparisons add no separate report/monitoring event. Every saved observation, including an unchanged profile, retains its normal profile-event charge.

See the [live Pricing tab](https://apify.com/fascinating_lentil/tiktok-profile-scraper/pricing) for current event prices, discounts and platform-usage terms. Profile-result subtotals exclude the start fee.

## Input

```json
{
  "usernames": ["charlidamelio", "https://www.tiktok.com/@tiktok"],
  "trackGrowth": true,
  "monitorName": "us-creators",
  "observationHistoryLimit": 12,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

A run accepts up to 50 usernames or profile URLs. Residential proxy rotation is the reliable default for detailed public statistics. When only oEmbed metadata is available, identity fields are returned and unavailable metrics are `null` rather than estimated.

## Sample Output

```json
{
  "username": "charlidamelio",
  "displayName": "charli d'amelio",
  "bioText": "Public profile biography",
  "followersCount": 155000000,
  "followingCount": 1300,
  "totalLikesReceived": 11700000000,
  "totalVideosCount": 2800,
  "dataQuality": "detailed",
  "monitorName": "us-creators",
  "trackingStatus": "updated",
  "previousFollowersCount": 154900000,
  "followersDelta": 100000,
  "followersGrowthPercent": 0.0646,
  "followersPerDay": 12500,
  "videosDelta": 2,
  "postsPerWeek": 1.75,
  "growthSignals": ["followers_growing", "new_videos"],
  "observationCount": 4,
  "verifiedBadge": true,
  "region": "US",
  "profileUrl": "https://www.tiktok.com/@charlidamelio",
  "isPrivate": false,
  "scrapedAt": "2026-08-09T10:00:00.000Z"
}
```

## Reliability and Cost Controls

1. Usernames and URLs are normalized and deduplicated.
2. TikTok's official public oEmbed endpoint verifies profile identity as a fallback.
3. Detailed profile lookup is retried once with a fresh proxy session.
4. No browser, video download, login, or private endpoint is used.
5. Retries, memory, runtime, and input size are bounded.
6. The run fails clearly when no valid public profile is returned.
7. Short-interval count noise is suppressed, and daily velocity is calculated only after at least one hour.

## Responsible Use

- Public profiles only; private or login-protected data is not accessed.
- Do not use the Actor for harassment, sensitive-person profiling, deceptive outreach, or attempts to identify private individuals.
- You are responsible for following applicable laws, TikTok's terms, and Apify's platform rules.

## License

Apache-2.0
