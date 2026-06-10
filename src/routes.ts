import type { Page, Browser } from 'playwright';
import { PlaywrightCrawlingContext, Dataset } from 'crawlee';
import { Actor } from 'apify';
import type { ProfileRecord, VideoRecord } from './types.js';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const rand = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

const parseAbbreviatedNumber = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'string') return Number.isFinite(v) ? (v as number) : null;
    const s = v.replace(/,/g, '').trim();
    if (!s) return null;
    if (s.endsWith('B')) return Math.round(parseFloat(s) * 1_000_000_000);
    if (s.endsWith('M')) return Math.round(parseFloat(s) * 1_000_000);
    if (s.endsWith('K')) return Math.round(parseFloat(s) * 1_000);
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
};

const STR = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const now = (): string => new Date().toISOString();

function extractHashtags(text: string): string[] {
    const m = text.match(/#[\w\u0400-\u04FF]+/g);
    return m ? [...new Set(m.map((h) => h.slice(1)))] : [];
}

function extractMentions(text: string): string[] {
    const m = text.match(/@[\w.]+/g);
    return m ? [...new Set(m.map((m) => m.slice(1)))] : [];
}

async function safeInnerText(el: ReturnType<Page['locator']>): Promise<string | null> {
    return el.first().innerText().catch(() => null);
}

async function safeIsVisible(el: ReturnType<Page['locator']>): Promise<boolean> {
    return el.first().isVisible().catch(() => false);
}

async function safeGetAttribute(el: ReturnType<Page['locator']>, attr: string): Promise<string | null> {
    return el.first().getAttribute(attr).catch(() => null);
}

async function scrapeProfileData(page: Page, username: string): Promise<ProfileRecord | null> {
    try {
        const isPrivate = await safeIsVisible(page.locator('[data-e2e="private-account"]'));

        const displayName = await safeInnerText(
            page.locator('[data-e2e="profile-nickname"]'),
        );

        const bioText = await safeInnerText(
            page.locator('[data-e2e="profile-bio"]'),
        );

        const verifiedBadge = await safeIsVisible(
            page.locator('svg[title="Verified Check"]'),
        );

        const profileImageUrl = await safeGetAttribute(
            page.locator('[data-e2e="profile-avatar"] img'),
            'src',
        );

        const websiteInBio = await safeGetAttribute(
            page.locator('[data-e2e="profile-link"]'),
            'href',
        );

        const statEls = page.locator('[data-e2e="user-metrics"] div strong, [data-e2e="profile-stats"] strong');
        const allStatTexts: string[] = await statEls.allInnerTexts().catch(() => []) as string[];

        let followersCount: number | null = null;
        let followingCount: number | null = null;
        let totalLikesReceived: number | null = null;

        for (const t of allStatTexts) {
            const lower = t.toLowerCase();
            if (lower.includes('follower') || lower.includes('followers')) {
                const num = t.replace(/[^0-9.BMK]/gi, '').trim();
                followersCount = parseAbbreviatedNumber(num);
            } else if (lower.includes('following')) {
                const num = t.replace(/[^0-9.BMK]/gi, '').trim();
                followingCount = parseAbbreviatedNumber(num);
            } else if (lower.includes('like')) {
                const num = t.replace(/[^0-9.BMK]/gi, '').trim();
                totalLikesReceived = parseAbbreviatedNumber(num);
            }
        }

        const totalVideosCount = await safeInnerText(
            page.locator('[data-e2e="user-metrics"] a[href*="/video"] span, [data-e2e="videos-tab"] span'),
        ).then((t) => {
            if (!t) return null;
            const m = t.match(/(\d[\d,]*)/);
            return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
        }) as number | null;

        const regionRaw = await safeInnerText(page.locator('[data-e2e="profile-region"], [data-e2e="profile-country"]'));

        return {
            username,
            displayName: STR(displayName) || username,
            bioText: STR(bioText) || '',
            followersCount,
            followingCount,
            totalLikesReceived,
            totalVideosCount,
            verifiedBadge,
            profileImageUrl,
            profileUrl: `https://www.tiktok.com/@${username}`,
            region: STR(regionRaw) || null,
            websiteInBio,
            isPrivate,
            scrapedAt: now(),
        };
    } catch {
        return null;
    }
}

async function getBrowser(page: Page): Promise<Browser> {
    const ctx = page.context();
    const browser = await ctx.browser();
    if (!browser) throw new Error('No browser available');
    return browser;
}

async function scrapeSingleVideoPage(
    browser: Browser,
    videoUrl: string,
    feedData: Partial<VideoRecord>,
): Promise<VideoRecord> {
    const vp = await browser.newPage();
    try {
        await vp.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(rand(3000, 6000));

        const description = STR(
            await safeInnerText(vp.locator('[data-e2e="browse-video-desc"], [data-e2e="video-desc"]'))
            || feedData.description || '',
        );
        const hashtags = description ? extractHashtags(description) : (feedData.hashtags || []);
        const mentions = description ? extractMentions(description) : (feedData.mentions || []);

        const fullSound = await safeInnerText(vp.locator('[data-e2e="music-title"]'));
        let soundName: string | null = feedData.soundName || null;
        let soundAuthor: string | null = feedData.soundAuthor || null;
        if (fullSound) {
            const parts = fullSound.split(' - ');
            soundName = STR(parts[0]) || soundName;
            soundAuthor = STR(parts[1]) || (parts.length > 2 ? STR(parts.slice(1).join(' - ')) : null);
        }

        const allStatTexts: string[] = await vp.locator('[data-e2e="like-count"], [data-e2e="comment-count"], [data-e2e="share-count"]')
            .allInnerTexts()
            .catch(() => []) as string[];

        let likesCount: number | null = null;
        let commentsCount: number | null = null;
        let sharesCount: number | null = null;

        for (const t of allStatTexts) {
            const lower = t.toLowerCase();
            if (lower.includes('like')) {
                likesCount = parseAbbreviatedNumber(t.replace(/[^0-9.BMK]/gi, '').trim());
            } else if (lower.includes('comment')) {
                commentsCount = parseAbbreviatedNumber(t.replace(/[^0-9.BMK]/gi, '').trim());
            } else if (lower.includes('share')) {
                sharesCount = parseAbbreviatedNumber(t.replace(/[^0-9.BMK]/gi, '').trim());
            }
        }

        const viewsText = await safeInnerText(vp.locator('[data-e2e="video-views"], [data-e2e="play-count"]'));
        const viewsCount = parseAbbreviatedNumber(viewsText?.replace(/[^0-9.BMK]/gi, '').trim() ?? null);

        const dateAttr = await safeGetAttribute(vp.locator('[data-e2e="video-time"]'), 'datetime');
        const postedDate = dateAttr || await safeInnerText(vp.locator('[data-e2e="video-time"]')) || null;

        const durationAttr = await safeGetAttribute(vp.locator('video'), 'duration');
        const durationSeconds = durationAttr ? parseFloat(durationAttr) || null : feedData.durationSeconds || null;

        const thumbnailUrl = await safeGetAttribute(vp.locator('[data-e2e="video-cover"] img, [class*="video-mask"] img'), 'src')
            || feedData.thumbnailUrl || null;

        return {
            videoId: feedData.videoId || '',
            videoUrl,
            description,
            hashtags,
            mentions,
            soundName,
            soundAuthor,
            likesCount,
            commentsCount,
            sharesCount,
            viewsCount,
            postedDate,
            durationSeconds,
            thumbnailUrl,
            isAd: feedData.isAd || false,
            isPinned: feedData.isPinned || false,
            scrapedAt: now(),
        };
    } finally {
        await vp.close().catch(() => {});
    }
}

async function scrapeVideoFeed(
    ctx: PlaywrightCrawlingContext,
    page: Page,
    profile: ProfileRecord,
    maxVideos: number,
): Promise<VideoRecord[]> {
    const videos: VideoRecord[] = [];
    const seenIds = new Set<string>();
    let noNewCount = 0;
    const browser = await getBrowser(page);

    for (let scrollAttempt = 0; scrollAttempt < maxVideos * 3 && videos.length < maxVideos && noNewCount < 5; scrollAttempt++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await sleep(rand(3000, 7000));

        const items = page.locator('[data-e2e="user-post-item"], [data-e2e="video-card"], div[data-e2e*="video"]:has(a[href*="/video/"])');
        const count = await items.count().catch(() => 0);

        for (let i = 0; i < count && videos.length < maxVideos; i++) {
            const item = items.nth(i);
            const link = await safeGetAttribute(item.locator('a[href*="/video/"]'), 'href');
            if (!link) continue;

            const videoIdMatch = link.match(/\/video\/(\d+)/);
            const videoId = videoIdMatch ? videoIdMatch[1] : null;
            if (!videoId || seenIds.has(videoId)) continue;
            seenIds.add(videoId);

            const desc = await safeInnerText(item.locator('[data-e2e="video-desc"], [data-e2e="video-caption"], [class*="caption"]')) || '';
            const hashtags = extractHashtags(desc);
            const mentions = extractMentions(desc);

            const isPinned = await safeIsVisible(item.locator('[data-e2e="pinned"], [class*="pinned"]'));
            const isAd = await safeIsVisible(item.locator('[class*="ad"]:not([class*="ad"] [class*="ad"]), [data-e2e*="ad"], text=Sponsored'));

            const thumbUrl = await safeGetAttribute(item.locator('img').first(), 'src');
            const music = await safeInnerText(item.locator('[data-e2e="music-title"], [data-e2e="video-music"]'));

            const videoUrl = link.startsWith('http') ? link : `https://www.tiktok.com${link}`;

            const feedData: Partial<VideoRecord> = {
                videoId,
                videoUrl,
                description: STR(desc),
                hashtags,
                mentions,
                soundName: music ? STR(music) : null,
                thumbnailUrl: thumbUrl,
                isAd,
                isPinned,
            };

            try {
                const fullRecord = await scrapeSingleVideoPage(browser, videoUrl, feedData);
                videos.push(fullRecord);
            } catch {
                videos.push({
                    videoId,
                    videoUrl,
                    description: STR(desc),
                    hashtags,
                    mentions,
                    soundName: music ? STR(music) : null,
                    soundAuthor: null,
                    likesCount: null,
                    commentsCount: null,
                    sharesCount: null,
                    viewsCount: null,
                    postedDate: null,
                    durationSeconds: null,
                    thumbnailUrl: thumbUrl,
                    isAd,
                    isPinned,
                    scrapedAt: now(),
                });
            }
        }

        noNewCount = count > 0 ? 0 : noNewCount + 1;
    }

    return videos;
}

export async function handleProfile(
    ctx: PlaywrightCrawlingContext,
    profileDataset: Dataset<ProfileRecord>,
    videoDataset: Dataset<VideoRecord>,
    username: string,
    maxVideosPerProfile: number,
): Promise<void> {
    const { page, log } = ctx;

    log.info(`Scraping profile: @${username}`);
    const profileUrl = `https://www.tiktok.com/@${username}`;

    try {
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(rand(3000, 7000));

        const errorVisible = await safeIsVisible(page.locator('[data-e2e="error-page"], text="Something went wrong", text="could not be found", text="This account doesn\'t exist"'));
        if (errorVisible) {
            log.warning(`Error page for @${username}, retrying after delay`);
            await sleep(rand(8000, 15000));
            await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await sleep(rand(3000, 7000));
        }

        const profile = await scrapeProfileData(page, username);
        if (!profile) {
            log.warning(`Could not extract profile data for @${username}`);
            return;
        }

        // Only save and charge when we actually extracted meaningful data. A blocked
        // or challenge page yields an all-empty record — don't bill users for that.
        const hasData = profile.followersCount !== null
            || profile.totalLikesReceived !== null
            || profile.totalVideosCount !== null
            || (profile.displayName !== '' && profile.displayName !== username)
            || profile.bioText !== '';
        if (!hasData) {
            log.warning(`No profile data extracted for @${username} (likely blocked/challenge page). Not saving or charging.`);
            return;
        }

        await profileDataset.pushData(profile);
        log.info(`Profile scraped: @${username} (private=${profile.isPrivate})`);

        if (profile.isPrivate) {
            log.info(`Skipping videos for private account @${username}`);
            await Actor.charge({ eventName: 'profile-scraped' });
            return;
        }

        const videos = await scrapeVideoFeed(ctx, page, profile, maxVideosPerProfile);
        log.info(`Found ${videos.length} videos for @${username}`);

        if (videos.length > 0) {
            await videoDataset.pushData(videos);
        }

        await Actor.charge({ eventName: 'profile-scraped' });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`Failed to scrape @${username}: ${msg}`);
    }
}
