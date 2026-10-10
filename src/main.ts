import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import {
    applyGrowthTracking,
    loadProfileState,
    monitorStoreName,
    saveProfileState,
    type MonitorStore,
} from './monitor.js';
import { parseTikTokHtml, parseTikTokOEmbed, parseTikTokPayload } from './parsers.js';
import type { ActorInput, ProfileRecord, TikTokResult } from './types.js';

const MAX_PROFILES = 50;

function cookieHeader(setCookie: string | string[] | undefined): string {
    const entries = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    return entries.map((entry) => entry.split(';', 1)[0]).filter(Boolean).join('; ');
}

function normalizeUsername(value: string): string | null {
    const trimmed = value.trim();
    const match = trimmed.match(/tiktok\.com\/@([^/?#]+)/i);
    const candidate = (match?.[1] ?? trimmed).replace(/^@/, '');
    return /^[a-zA-Z0-9._]{1,24}$/.test(candidate) ? candidate : null;
}

async function storeResult(profile: ProfileRecord): Promise<{ saved: boolean; limitReached: boolean }> {
    const chargeResult = await Actor.pushData(profile, 'profile-scraped');
    return {
        saved: chargeResult.chargedCount > 0 || chargeResult.eventChargeLimitReached !== true,
        limitReached: chargeResult.eventChargeLimitReached === true,
    };
}

async function fetchOEmbedProfile(username: string, proxyUrl?: string): Promise<TikTokResult | null> {
    try {
        const response = await gotScraping({
            url: 'https://www.tiktok.com/oembed',
            searchParams: { url: `https://www.tiktok.com/@${username}` },
            proxyUrl,
            headers: { accept: 'application/json', 'accept-language': 'en-US,en;q=0.9' },
            responseType: 'json',
            timeout: { request: 10_000 },
            retry: { limit: 0 },
            throwHttpErrors: false,
        });
        if (response.statusCode !== 200) {
            log.debug(`TikTok oEmbed returned HTTP ${response.statusCode} for @${username}.`);
            return null;
        }
        return parseTikTokOEmbed(response.body as Record<string, unknown>, username);
    } catch (error) {
        log.debug(`TikTok oEmbed lookup failed for @${username}: ${String(error)}`);
        return null;
    }
}

async function fetchProfile(username: string, proxyUrl?: string): Promise<TikTokResult | null> {
    try {
        const response = await gotScraping({
            url: `https://www.tiktok.com/@${encodeURIComponent(username)}`,
            proxyUrl,
            headers: { accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' },
            timeout: { request: 20_000 },
            retry: { limit: 0 },
            throwHttpErrors: false,
        });
        if (response.statusCode !== 200) {
            log.debug(`TikTok profile page returned HTTP ${response.statusCode} for @${username}.`);
            return null;
        }
        const embeddedResult = parseTikTokHtml(response.body, username);
        if (embeddedResult) return embeddedResult;

        log.debug(`TikTok profile page for @${username} contained no supported profile payload (${response.body.length} bytes).`);

        const cookies = cookieHeader(response.headers['set-cookie']);
        const msToken = cookies.match(/(?:^|;\s*)msToken=([^;]+)/)?.[1] ?? '';
        const apiResponse = await gotScraping({
            url: 'https://www.tiktok.com/api/user/detail/',
            searchParams: {
                aid: '1988',
                app_language: 'en',
                app_name: 'tiktok_web',
                browser_language: 'en-US',
                browser_name: 'Mozilla',
                browser_online: 'true',
                browser_platform: 'Win32',
                channel: 'tiktok_web',
                cookie_enabled: 'true',
                device_platform: 'web_pc',
                focus_state: 'true',
                from_page: 'user',
                history_len: '2',
                is_fullscreen: 'false',
                is_page_visible: 'true',
                language: 'en',
                msToken,
                os: 'windows',
                priority_region: '',
                region: 'US',
                screen_height: '1080',
                screen_width: '1920',
                tz_name: 'America/New_York',
                uniqueId: username,
            },
            proxyUrl,
            headers: {
                accept: 'application/json, text/plain, */*',
                'accept-language': 'en-US,en;q=0.9',
                cookie: cookies,
                referer: `https://www.tiktok.com/@${encodeURIComponent(username)}`,
            },
            responseType: 'json',
            timeout: { request: 10_000 },
            retry: { limit: 0 },
            throwHttpErrors: false,
        });
        if (apiResponse.statusCode !== 200) return null;
        return parseTikTokPayload(apiResponse.body as Record<string, unknown>, username);
    } catch (error) {
        log.debug(`HTTP profile lookup failed for @${username}: ${String(error)}`);
        return null;
    }
}

Actor.main(async () => {
    const input = (await Actor.getInput<ActorInput>()) ?? { usernames: [] };
    const usernames = [...new Set((input.usernames ?? []).map(normalizeUsername).filter((u): u is string => Boolean(u)))];
    if (usernames.length === 0) throw new Error('Provide at least one valid TikTok username or profile URL.');
    if (usernames.length > MAX_PROFILES) throw new Error(`A run can contain at most ${MAX_PROFILES} profiles.`);

    const trackGrowth = input.trackGrowth === true;
    const monitorName = (input.monitorName ?? 'default').trim();
    const historyLimit = input.observationHistoryLimit ?? 12;
    if (trackGrowth && !/^[A-Za-z0-9 _-]{1,64}$/.test(monitorName)) {
        throw new Error('Monitor name must contain 1-64 letters, numbers, spaces, underscores, or hyphens.');
    }
    if (!Number.isInteger(historyLimit) || historyLimit < 2 || historyLimit > 30) {
        throw new Error('Observation history limit must be an integer between 2 and 30.');
    }

    const proxyInput = input.proxyConfiguration;
    const proxyConfiguration = proxyInput?.useApifyProxy
        ? await Actor.createProxyConfiguration({
            groups: proxyInput.apifyProxyGroups?.length ? proxyInput.apifyProxyGroups : ['RESIDENTIAL'],
            countryCode: proxyInput.apifyProxyCountry,
        })
        : undefined;
    let savedProfiles = 0;
    let monitoringBaselines = 0;
    let monitoringUpdates = 0;
    let monitoringUnchanged = 0;
    let monitoringPartial = 0;
    let monitoringStateWriteFailures = 0;
    const monitorStore = trackGrowth
        ? await Actor.openKeyValueStore(monitorStoreName(monitorName)) as unknown as MonitorStore
        : null;

    await Actor.setStatusMessage(`Checking ${usernames.length} TikTok profile(s)`);
    for (const username of usernames) {
        let result: TikTokResult | null = null;
        let oEmbedResult = await fetchOEmbedProfile(username);
        for (let attempt = 1; attempt <= 2 && !result; attempt += 1) {
            const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : undefined;
            if (!oEmbedResult && attempt === 1 && proxyUrl) {
                oEmbedResult = await fetchOEmbedProfile(username, proxyUrl);
            }
            result = await fetchProfile(username, proxyUrl);
            if (!result && attempt === 1) log.info(`Retrying @${username} with a fresh HTTP session.`);
        }
        if (!result && oEmbedResult) {
            log.info(`Using TikTok's public oEmbed metadata for @${username}; detailed metrics were not available.`);
            result = oEmbedResult;
        }
        if (!result) {
            log.warning(`No public profile data returned for @${username}.`);
            continue;
        }
        let profile = result.profile;
        let nextMonitorState = null;
        if (monitorStore) {
            try {
                const previousState = await loadProfileState(monitorStore, username);
                const prepared = applyGrowthTracking(profile, previousState, monitorName, historyLimit);
                profile = prepared.profile;
                nextMonitorState = prepared.state;
            } catch (error) {
                log.warning(`Could not load growth history for @${username}; saving the profile without tracking fields: ${String(error)}`);
            }
        }

        const stored = await storeResult(profile);
        if (stored.saved) {
            savedProfiles += 1;
            if (profile.trackingStatus === 'baseline') monitoringBaselines += 1;
            if (profile.trackingStatus === 'updated') monitoringUpdates += 1;
            if (profile.trackingStatus === 'unchanged') monitoringUnchanged += 1;
            if (profile.trackingStatus === 'partial') monitoringPartial += 1;
            if (monitorStore && nextMonitorState) {
                try {
                    await saveProfileState(monitorStore, username, nextMonitorState);
                } catch (error) {
                    monitoringStateWriteFailures += 1;
                    log.warning(`Saved @${username}, but could not persist its growth history: ${String(error)}`);
                }
            }
        }
        if (stored.limitReached) {
            log.info(`Stopped at the user's maximum charge after ${savedProfiles} saved profile(s).`);
            break;
        }
    }

    if (savedProfiles === 0) {
        throw new Error('No public TikTok profiles could be collected. The targets may be private, unavailable, region-gated, or temporarily blocked.');
    }
    await Actor.setValue('OUTPUT', {
        status: 'COMPLETE',
        profilesRequested: usernames.length,
        profilesSaved: savedProfiles,
        trackGrowth,
        monitorName: trackGrowth ? monitorName : null,
        monitoring: {
            baselines: monitoringBaselines,
            updated: monitoringUpdates,
            unchanged: monitoringUnchanged,
            partial: monitoringPartial,
            stateWriteFailures: monitoringStateWriteFailures,
        },
    });
    await Actor.setStatusMessage(`Saved ${savedProfiles}/${usernames.length} profile(s)`);
});
