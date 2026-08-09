# TikTok Profile Scraper - Public Profile Analytics

Collect structured metadata and statistics from public TikTok profiles for creator research, brand monitoring, and market analysis.

The Actor reads TikTok's public embedded profile payload through bounded HTTP sessions and charges only after a profile record is successfully saved.

## What It Extracts

- Username, display name, biography, and profile URL
- Followers, following, total likes, and video count
- Verification, privacy, and region signals
- Public website in bio and profile image URL
- Collection timestamp

## Pricing

Each successfully saved public profile costs **$0.002**. Failed, blocked, private, unavailable, and unsaved profiles are not charged.

## Input

```json
{
  "usernames": ["charlidamelio", "https://www.tiktok.com/@tiktok"],
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

A run accepts up to 50 usernames or profile URLs. Residential proxy rotation is the reliable default for consistent public responses.

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
  "verifiedBadge": true,
  "region": "US",
  "profileUrl": "https://www.tiktok.com/@charlidamelio",
  "isPrivate": false,
  "scrapedAt": "2026-08-09T10:00:00.000Z"
}
```

## Reliability and Cost Controls

1. Usernames and URLs are normalized and deduplicated.
2. A low-cost public HTML or API lookup is attempted first.
3. A failed lookup is retried once with a fresh proxy session.
4. No browser, video download, login, or private endpoint is used.
5. Retries, memory, runtime, and input size are bounded.
6. The run fails clearly when no valid public profile is returned.

## Responsible Use

- Public profiles only; private or login-protected data is not accessed.
- Do not use the Actor for harassment, sensitive-person profiling, deceptive outreach, or attempts to identify private individuals.
- You are responsible for following applicable laws, TikTok's terms, and Apify's platform rules.

## License

Apache-2.0
