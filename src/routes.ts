import type { Page, Response as PWResponse } from 'playwright';
import { PlaywrightCrawlingContext, Dataset } from 'crawlee';
import { Actor, log as apifyLog } from 'apify';
import type { ProfileRecord, VideoRecord } from './types.js';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const rand = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

const parseAbbreviatedNumber = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
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
    return m ? [...new Set(m.map((x) => x.slice(1)))] : [];
}

async function safeIsVisible(el: ReturnType<Page['locator']>): Promise<boolean> {
    return el.first().isVisible().catch(() => false);
}

async function scrapeProfileData(page: Page, username: string): Promise<ProfileRecord | null> {
    // Parse TikTok's embedded rehydration JSON, which carries full profile data in the
    // server-rendered HTML. Far more reliable than the challenge-gated data-e2e DOM.
    try {
        const html = await page.content();
        const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
        if (!m || !m[1]) {
            const title = await page.title().catch(() => '');
            apifyLog.info(
                `[diag] @${username}: rehydration ${html.includes('__UNIVERSAL_DATA_FOR_REHYDRATION__') ? 'present-but-unparsed' : 'ABSENT'}; htmlLen=${html.length}; title="${title}"; captchaHint=${/captcha|verify|robot|unusual traffic/i.test(html)}`,
            );
            return null;
        }
        const data = JSON.parse(m[1]);
        const userInfo = data?.['__DEFAULT_SCOPE__']?.['webapp.user-detail']?.userInfo;
        const user = userInfo?.user;
        const stats = userInfo?.statsV2 ?? userInfo?.stats;
        if (!user || !(stats || user.uniqueId)) {
            apifyLog.info(`[diag] @${username}: rehydration parsed but no userInfo.user (account may not exist or is region-gated).`);
            return null;
        }
        return {
            username: STR(user.uniqueId) || username,
            displayName: STR(user.nickname) || username,
            bioText: STR(user.signature) || '',
            followersCount: parseAbbreviatedNumber(stats?.followerCount),
            followingCount: parseAbbreviatedNumber(stats?.followingCount),
            totalLikesReceived: parseAbbreviatedNumber(stats?.heartCount ?? stats?.heart),
            totalVideosCount: parseAbbreviatedNumber(stats?.videoCount),
            verifiedBadge: Boolean(user.verified),
            profileImageUrl: STR(user.avatarLarger) || STR(user.avatarMedium) || null,
            profileUrl: `https://www.tiktok.com/@${STR(user.uniqueId) || username}`,
            region: STR(user.region) || null,
            websiteInBio: STR(user.bioLink?.link) || null,
            isPrivate: Boolean(user.privateAccount),
            scrapedAt: now(),
        };
    } catch (err) {
        apifyLog.warning(`[diag] @${username}: rehydration parse error: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}

function mapApiItem(item: Record<string, any>, username: string): VideoRecord | null {
    const id = STR(item.id);
    if (!id) return null;
    const stats = item.statsV2 ?? item.stats ?? {};
    const desc = STR(item.desc);
    const author = STR(item.author?.uniqueId) || username;
    const createTime = item.createTime ? Number(item.createTime) : null;
    return {
        videoId: id,
        videoUrl: `https://www.tiktok.com/@${author}/video/${id}`,
        description: desc,
        hashtags: extractHashtags(desc),
        mentions: extractMentions(desc),
        soundName: STR(item.music?.title) || null,
        soundAuthor: STR(item.music?.authorName) || null,
        likesCount: parseAbbreviatedNumber(stats.diggCount),
        commentsCount: parseAbbreviatedNumber(stats.commentCount),
        sharesCount: parseAbbreviatedNumber(stats.shareCount),
        viewsCount: parseAbbreviatedNumber(stats.playCount),
        postedDate: createTime ? new Date(createTime * 1000).toISOString() : null,
        durationSeconds: typeof item.video?.duration === 'number' ? item.video.duration : null,
        thumbnailUrl: STR(item.video?.cover) || STR(item.video?.originCover) || STR(item.video?.dynamicCover) || null,
        isAd: Boolean(item.isAd),
        isPinned: Boolean(item.isPinnedItem ?? item.is_pinned_item ?? false),
        scrapedAt: now(),
    };
}

/**
 * Collect videos by intercepting TikTok's `post/item_list` XHR responses while
 * scrolling the profile grid. The JSON carries full per-video metrics (views,
 * likes, comments, shares, duration, sound, timestamps) without opening each
 * video page — much faster and more reliable than DOM scraping.
 */
async function scrapeVideoFeed(page: Page, username: string, maxVideos: number, collected: Map<string, VideoRecord>): Promise<VideoRecord[]> {
    let lastSize = collected.size;
    let stagnant = 0;

    for (let i = 0; i < maxVideos * 2 + 6 && collected.size < maxVideos && stagnant < 4; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2)).catch(() => {});
        await sleep(rand(1500, 3200));
        if (collected.size > lastSize) {
            lastSize = collected.size;
            stagnant = 0;
        } else {
            stagnant += 1;
        }
    }
    // Grace wait for any in-flight item_list response to resolve.
    await sleep(1500);

    return [...collected.values()].slice(0, maxVideos);
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

    // Attach the response interceptor before anything else so we also capture the
    // first item_list batch fired during initial page render.
    const collected = new Map<string, VideoRecord>();
    const onResponse = (response: PWResponse): void => {
        const url = response.url();
        if (!/item_list|item\/list/i.test(url)) return;
        response
            .json()
            .then((json: any) => {
                const list = Array.isArray(json?.itemList) ? json.itemList : [];
                for (const item of list) {
                    const rec = mapApiItem(item, username);
                    if (rec && !collected.has(rec.videoId)) collected.set(rec.videoId, rec);
                }
            })
            .catch(() => {});
    };
    page.on('response', onResponse);

    try {
        // Crawlee already navigated to profileUrl. Wait for the rehydration payload;
        // if it never appears the page is almost certainly a challenge/block.
        await page.waitForSelector('#__UNIVERSAL_DATA_FOR_REHYDRATION__', { timeout: 20000 }).catch(() => {});
        await sleep(rand(1500, 3000));

        const errorVisible = await safeIsVisible(
            page.locator('[data-e2e="error-page"], text="Something went wrong", text="couldn\'t find this account", text="This account doesn\'t exist"'),
        );
        if (errorVisible) {
            log.warning(`Error page for @${username}, reloading once`);
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
            await page.waitForSelector('#__UNIVERSAL_DATA_FOR_REHYDRATION__', { timeout: 20000 }).catch(() => {});
            await sleep(rand(1500, 3000));
        }

        const profile = await scrapeProfileData(page, username);
        if (!profile) {
            // Throw so Crawlee's retryOnBlocked rotates to a fresh session/proxy IP
            // and tries again, instead of silently "succeeding" with no data.
            throw new Error(`Could not extract profile data for @${username} (page likely blocked/challenge)`);
        }

        const hasData = profile.followersCount !== null
            || profile.totalLikesReceived !== null
            || profile.totalVideosCount !== null
            || (profile.displayName !== '' && profile.displayName !== username)
            || profile.bioText !== '';
        if (!hasData) {
            throw new Error(`No meaningful profile data for @${username} (likely blocked/challenge page)`);
        }

        await profileDataset.pushData(profile);
        // Charge once the valuable profile record is saved. Video scraping below is
        // best-effort and must not undo this charge or trigger a full-profile retry.
        await Actor.charge({ eventName: 'profile-scraped' });
        log.info(`Profile scraped: @${username} (followers=${profile.followersCount}, private=${profile.isPrivate})`);

        if (profile.isPrivate) {
            log.info(`Skipping videos for private account @${username}`);
            return;
        }

        if (maxVideosPerProfile > 0) {
            try {
                const videos = await scrapeVideoFeed(page, profile.username, maxVideosPerProfile, collected);
                log.info(`Found ${videos.length} videos for @${username}`);
                if (videos.length > 0) {
                    await videoDataset.pushData(videos);
                }
            } catch (videoErr: unknown) {
                const vmsg = videoErr instanceof Error ? videoErr.message : String(videoErr);
                log.warning(`Video feed scraping failed for @${username} (profile already saved): ${vmsg}`);
            }
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`Failed to scrape @${username}: ${msg}`);
        throw err instanceof Error ? err : new Error(msg);
    } finally {
        page.off('response', onResponse);
    }
}
