# TikTok Profile Scraper - Creator Growth Monitor

Collect structured public TikTok profile statistics and turn scheduled runs into creator-growth intelligence for influencer research, campaign reporting, competitor monitoring, and brand analysis.

The Actor reads TikTok's public embedded profile payload through bounded HTTP sessions. If TikTok challenges the detailed profile page, it falls back to TikTok's official public oEmbed metadata. It charges only after a profile record is successfully saved.

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

## Pricing

Each successfully saved public profile costs **$0.002**. Failed, blocked, private, unavailable, and unsaved profiles are not charged.

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

## Responsible Use

- Public profiles only; private or login-protected data is not accessed.
- Do not use the Actor for harassment, sensitive-person profiling, deceptive outreach, or attempts to identify private individuals.
- You are responsible for following applicable laws, TikTok's terms, and Apify's platform rules.

## License

Apache-2.0
