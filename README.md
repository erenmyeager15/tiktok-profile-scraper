# TikTok Profile Scraper - Followers, Videos & Engagement Analytics

Scrape public TikTok profiles and their videos, then pull follower counts, likes, bios, video views, hashtags, mentions, and engagement metrics into clean, structured data. Export to JSON, CSV, Excel, or HTML, or pull via the Apify API — no TikTok login and no API key required.

This TikTok scraper reads each profile's public data and per-video metrics, handles residential proxy rotation, session management, and anti-bot protections so runs stay reliable, and skips private accounts gracefully. Profiles are saved to the default Apify Dataset and videos to a separate `videos` dataset, so each is easy to export on its own.

## What It Extracts

**Per profile** (default dataset):

- `username`, `displayName`, `bioText`
- `followersCount`, `followingCount`
- `totalLikesReceived`, `totalVideosCount`
- `verifiedBadge` (verification status)
- `profileImageUrl`, `profileUrl`
- `region`, `websiteInBio`
- `isPrivate`
- `scrapedAt` timestamp

**Per video** (`videos` dataset):

- `videoId`, `videoUrl`
- `description`, `hashtags`, `mentions`
- `soundName`, `soundAuthor`
- `likesCount`, `commentsCount`, `sharesCount`, `viewsCount`
- `postedDate`, `durationSeconds`
- `thumbnailUrl`
- `isAd`, `isPinned`
- `scrapedAt` timestamp

## Use Cases

1. **Influencer research**: Evaluate TikTok creators by audience size, content volume, and per-video engagement before a partnership.
2. **Competitor analysis**: Track competitor video performance, posting cadence, and trending content to sharpen your own TikTok strategy.
3. **Brand monitoring**: Follow how your brand shows up through hashtag and @mention extraction across public creator profiles.
4. **Content strategy**: Find the topics, sounds, and formats that drive the most views and likes in your niche by studying top performers.
5. **Social media reporting**: Feed structured exports into automated reporting pipelines and client-facing analytics dashboards.

## Pricing

This Actor uses Apify Pay Per Event pricing. You are charged once per public profile successfully scraped and saved — blocked, empty, or private-with-no-data results are not billed. Video scraping is included at no extra per-event cost. Apify platform compute and proxy usage are billed separately by Apify.

| Event name | Price per event | 1,000 profiles | 10,000 profiles |
| --- | ---: | ---: | ---: |
| `profile-scraped` | $0.002 | $2.00 | $20.00 |

## Input

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `usernames` | string[] | Yes | — | TikTok usernames (e.g. `charlidamelio`) or full profile URLs. Public profiles only. |
| `maxVideosPerProfile` | integer | No | `0` | Videos to scrape per profile (0–200). Profile data is always scraped reliably; video scraping is best-effort (beta) and slower. Leave at `0` for fast profile-only runs. |
| `proxyConfiguration` | object | No | `{ useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] }` | Proxy settings. Residential rotation is strongly recommended for TikTok. |

## How to Scrape TikTok Profiles (Step by Step)

1. Click **Try for free** / **Run**.
2. Add one or more TikTok usernames or profile URLs to `usernames`.
3. Set `maxVideosPerProfile` (start with `0` to test fast profile-only scraping, then raise it to pull videos).
4. Keep residential proxies enabled and run the Actor.
5. Export the profiles from the default dataset and the videos from the `videos` dataset as JSON, CSV, Excel, or HTML, or pull them via the Apify API.

## Sample Output

### Profile record (default dataset)

```json
{
    "username": "charlidamelio",
    "displayName": "Charli D'Amelio",
    "bioText": "dreamer | dancer | coffee",
    "followersCount": 151000000,
    "followingCount": 1342,
    "totalLikesReceived": 11400000000,
    "totalVideosCount": 2800,
    "verifiedBadge": true,
    "profileImageUrl": "https://p16-sign-sg.tiktokcdn.com/...",
    "profileUrl": "https://www.tiktok.com/@charlidamelio",
    "region": "US",
    "websiteInBio": "https://www.charlidamelio.com",
    "isPrivate": false,
    "scrapedAt": "2026-01-15T10:30:00.000Z"
}
```

### Video record (`videos` dataset)

```json
{
    "videoId": "7328456789012345678",
    "videoUrl": "https://www.tiktok.com/@charlidamelio/video/7328456789012345678",
    "description": "dance challenge with friends #fyp #dance #fun",
    "hashtags": ["fyp", "dance", "fun"],
    "mentions": ["frienduser"],
    "soundName": "original sound - charlidamelio",
    "soundAuthor": "charlidamelio",
    "likesCount": 2400000,
    "commentsCount": 18500,
    "sharesCount": 45000,
    "viewsCount": 18000000,
    "postedDate": "2026-01-10T14:00:00.000Z",
    "durationSeconds": 15,
    "thumbnailUrl": "https://p16-sign-sg.tiktokcdn.com/...",
    "isAd": false,
    "isPinned": false,
    "scrapedAt": "2026-01-15T10:32:00.000Z"
}
```

## How It Works

1. Validates the input and normalizes each username (strips `@` and extracts the handle from full URLs).
2. Opens each public profile with a Playwright browser through residential proxies, using a session pool (max 8 uses per session) and randomized delays to stay resilient.
3. Reads the profile data from TikTok's embedded rehydration JSON, which is far more reliable than the challenge-gated DOM.
4. Saves the profile to the default dataset and charges `profile-scraped` once the clean record is stored.
5. When `maxVideosPerProfile > 0`, intercepts TikTok's video feed responses while scrolling, deduplicates videos by `videoId`, and saves them to the `videos` dataset. Private accounts are detected and skipped.

## Known Limits

- Only **public** profiles can be scraped. Private accounts are detected, saved with `isPrivate: true`, and their videos are skipped.
- Video scraping is **best-effort (beta)**: profile data is always collected reliably, but video counts can vary run to run and are slower. Leave `maxVideosPerProfile` at `0` for fast, reliable profile-only runs.
- Numeric fields are returned as `null` when TikTok does not expose them; abbreviated counts (e.g. `1.2M`) are expanded to full integers.
- TikTok actively rate-limits and challenges automated traffic. Residential proxies are strongly recommended, and occasional retries on blocked pages are expected.

## Responsible Use

This Actor is intended for lawful collection of publicly available information only. Users are responsible for ensuring their use complies with the source website's terms, robots.txt, applicable privacy laws, including India's DPDP Act, and all local regulations.

Do not use this Actor to collect, store, sell, or misuse personal data without a lawful basis. The Actor author is not responsible for misuse by end users.

## License

Apache-2.0. See `LICENSE`.
