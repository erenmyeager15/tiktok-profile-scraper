import { Actor } from 'apify';
import { PlaywrightCrawler, Dataset, log } from 'crawlee';
import type { ActorInput, ProfileRecord, VideoRecord } from './types.js';
import { handleProfile } from './routes.js';

Actor.main(async () => {
    const input = (await Actor.getInput<ActorInput>()) ?? {
        usernames: [],
        maxVideosPerProfile: 20,
        proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
    };

    const {
        usernames,
        maxVideosPerProfile,
        proxyConfiguration: proxyInput,
    } = input;

    if (!usernames || usernames.length === 0) {
        throw new Error('No usernames provided. Supply at least one TikTok username or profile URL.');
    }

    const cleanedUsernames = usernames.map((u) => {
        const s = u.trim();
        if (s.startsWith('http')) {
            const m = s.match(/@([^/?#]+)/);
            return m ? m[1] : s;
        }
        return s.replace(/^@/, '');
    });

    const proxyConfig = proxyInput
        ? await Actor.createProxyConfiguration(proxyInput)
        : undefined;

    const profileDataset = await Dataset.open<ProfileRecord>();
    const videoDataset = await Dataset.open<VideoRecord>('videos');

    const crawler = new PlaywrightCrawler({
        proxyConfiguration: proxyConfig,
        maxConcurrency: 2,
        maxRequestRetries: 3,
        retryOnBlocked: true,
        useSessionPool: true,
        requestHandlerTimeoutSecs: 120,
        sessionPoolOptions: {
            maxPoolSize: 16,
            sessionOptions: {
                maxUsageCount: 8,
            },
        },
        preNavigationHooks: [
            async ({ page }) => {
                // Fast-fail locator actions so missing selectors don't each block 30s
                // and stack up past the handler timeout on partial/challenge pages.
                page.setDefaultTimeout(6000);
            },
        ],
        requestHandler: async (ctx) => {
            const url = new URL(ctx.request.url);
            const username = url.pathname.split('/')[1]?.replace(/^@/, '') ?? ctx.request.userData.username;
            if (username) {
                await Actor.setStatusMessage(`Scraping @${username}`);
                await handleProfile(ctx, profileDataset, videoDataset, username, maxVideosPerProfile);
            }
        },
        failedRequestHandler: async ({ request, log }, error) => {
            log.error(`Request failed: ${request.url}`, { error: String(error) });
        },
    });

    const requests = cleanedUsernames.map((u) => ({
        url: `https://www.tiktok.com/@${u}`,
        userData: { username: u },
    }));

    Actor.setStatusMessage(`Scraping ${cleanedUsernames.length} profile(s)...`);
    await crawler.run(requests);
    await Actor.setStatusMessage('Scraping complete.');

    log.info('Scraping complete. Shutting down.');
});
