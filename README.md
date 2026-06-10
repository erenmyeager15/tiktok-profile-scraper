# TikTok Profile Scraper — Extract Videos & Analytics

Scrape public TikTok profiles and extract comprehensive video analytics using Apify and Playwright.

## What It Does

This Apify Actor scrapes public TikTok profiles to extract detailed profile information and video metrics. It handles residential proxy rotation, session management, and anti-bot protections to reliably collect data from TikTok without being blocked.

For each profile, it extracts: username, display name, bio, follower/following counts, total likes, video count, verification status, profile image, region, website link, and privacy status. For each video, it captures: video ID, full description, hashtags, mentions, sound/music details, likes, comments, shares, views, posted date, duration, thumbnail URL, ad flag, and pin status.

Private accounts are detected and skipped gracefully. All video data is deduplicated by video ID.

## Features

- **Batch Processing**: Scrape multiple profiles in a single run
- **Full Profile Data**: Extract all public profile fields including follower metrics
- **Video Analytics**: Capture per-video engagement metrics and metadata
- **Hashtag & Mention Extraction**: Automatically parse hashtags and @mentions from captions
- **Anti-Bot Protection**: Residential proxy rotation, session pool with max 8 uses per session, random delays (3-7s), retry on blocked
- **Dual Datasets**: Profiles and videos saved to separate Apify Datasets
- **PPE Integration**: Per-profile monetization via `profile-scraped` event at $0.005/profile
- **Private Account Handling**: Automatically detects and skips private profiles

## Use Cases

1. **Influencer Research**: Analyze TikTok creator profiles to understand audience size, content frequency, and engagement levels for partnership evaluation
2. **Competitor Analysis**: Track competitor video performance, posting patterns, and trending content to inform your own TikTok strategy
3. **Brand Monitoring**: Discover how your brand is being discussed through hashtag and mention tracking across public creator profiles
4. **Content Strategy**: Identify which video topics, sounds, and formats drive the most engagement in your niche by studying top performers
5. **Social Media Reporting**: Generate structured data exports for automated reporting pipelines and client-facing analytics dashboards

## Sample Output

### Profile Record
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
    "region": "United States",
    "websiteInBio": "https://www.charlidamelio.com",
    "isPrivate": false,
    "scrapedAt": "2026-01-15T10:30:00.000Z"
}
```

### Video Record
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

## Pricing

| Resource | Cost | Notes |
|----------|------|-------|
| Actor compute | $0.49/hour | Apify platform pricing |
| Residential proxy | $10/GB | Recommended for TikTok |
| Profile scraped | $0.005/profile | Pay-per-event fee |
| Dataset storage | Free (first 50 MB) | Included with Apify plan |

**Estimated cost per 100 profiles**: ~$0.50 actor time + $5.00 PPE + proxy usage

## Input Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `usernames` | string[] | Yes | — | TikTok usernames or profile URLs |
| `maxVideosPerProfile` | integer | No | 20 | Max videos to scrape per profile (0-200) |
| `proxyConfiguration` | object | No | `{useApifyProxy:true, apifyProxyGroups:["RESIDENTIAL"]}` | Proxy settings |

## Output Datasets

This Actor produces two datasets:

1. **profiles** — One record per scraped profile with account-level metrics
2. **videos** — One record per video with engagement and content metadata

## Ethics & Legal

This Actor scrapes only **publicly available** data from TikTok profiles. It does not bypass authentication, access private accounts, or extract personal data beyond what creators publicly share. Users are responsible for ensuring their use of scraped data complies with TikTok's Terms of Service, applicable laws, and data protection regulations in their jurisdiction.

## License

Apache-2.0
