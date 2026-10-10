import { createHash } from 'node:crypto';
import type { ProfileRecord } from './types.js';

export interface ProfileObservation {
    capturedAt: string;
    dataQuality: ProfileRecord['dataQuality'];
    displayName: string;
    bioText: string;
    followersCount: number | null;
    followingCount: number | null;
    totalLikesReceived: number | null;
    totalVideosCount: number | null;
    verifiedBadge: boolean;
    websiteInBio: string | null;
    region: string | null;
}

export interface ProfileMonitorState {
    version: 1;
    firstSeenAt: string;
    observationCount: number;
    observations: ProfileObservation[];
}

export interface MonitorStore {
    getValue<T>(key: string): Promise<T | null>;
    setValue<T>(key: string, value: T): Promise<void>;
}

const round = (value: number | null, digits = 4): number | null => {
    if (value === null || !Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
};
const MIN_RATE_INTERVAL_DAYS = 1 / 24;
const COUNT_NOISE_RATIO = 0.0001;

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

export function monitorStoreName(monitorName: string): string {
    return `tiktok-growth-${hash(monitorName.trim().toLowerCase()).slice(0, 24)}`;
}

export function monitorRecordKey(username: string): string {
    return `PROFILE_${hash(username.trim().toLowerCase()).slice(0, 32)}`;
}

function observation(profile: ProfileRecord): ProfileObservation {
    return {
        capturedAt: profile.scrapedAt,
        dataQuality: profile.dataQuality,
        displayName: profile.displayName,
        bioText: profile.bioText,
        followersCount: profile.followersCount,
        followingCount: profile.followingCount,
        totalLikesReceived: profile.totalLikesReceived,
        totalVideosCount: profile.totalVideosCount,
        verifiedBadge: profile.verifiedBadge,
        websiteInBio: profile.websiteInBio,
        region: profile.region,
    };
}

function numericChange(
    changedFields: string[],
    field: string,
    current: number | null,
    previous: number | null,
    noiseRatio = COUNT_NOISE_RATIO,
): number | null {
    if (current === null || previous === null) return null;
    const delta = current - previous;
    const minimumMeaningfulDelta = Math.max(1, Math.ceil(Math.abs(previous) * noiseRatio));
    if (Math.abs(delta) < minimumMeaningfulDelta) return null;
    if (delta !== 0) changedFields.push(field);
    return delta;
}

function textChanged(current: unknown, previous: unknown): boolean {
    return (current ?? null) !== (previous ?? null);
}

export function applyGrowthTracking(
    profile: ProfileRecord,
    previousState: ProfileMonitorState | null,
    monitorName: string,
    historyLimit: number,
): { profile: ProfileRecord; state: ProfileMonitorState } {
    const current = observation(profile);
    const previousDetailed = [...(previousState?.observations ?? [])]
        .reverse()
        .find((item) => item.dataQuality === 'detailed') ?? null;
    const changedFields: string[] = [];

    let followersDelta: number | null = null;
    let likesDelta: number | null = null;
    let videosDelta: number | null = null;
    let daysSincePrevious: number | null = null;

    if (profile.dataQuality === 'detailed' && previousDetailed) {
        followersDelta = numericChange(changedFields, 'followersCount', profile.followersCount, previousDetailed.followersCount);
        numericChange(changedFields, 'followingCount', profile.followingCount, previousDetailed.followingCount);
        likesDelta = numericChange(changedFields, 'totalLikesReceived', profile.totalLikesReceived, previousDetailed.totalLikesReceived);
        videosDelta = numericChange(changedFields, 'totalVideosCount', profile.totalVideosCount, previousDetailed.totalVideosCount, 0);
        if (textChanged(profile.displayName, previousDetailed.displayName)) changedFields.push('displayName');
        if (textChanged(profile.bioText, previousDetailed.bioText)) changedFields.push('bioText');
        if (textChanged(profile.websiteInBio, previousDetailed.websiteInBio)) changedFields.push('websiteInBio');
        if (profile.verifiedBadge !== previousDetailed.verifiedBadge) changedFields.push('verifiedBadge');
        if (textChanged(profile.region, previousDetailed.region)) changedFields.push('region');
        const elapsed = (Date.parse(profile.scrapedAt) - Date.parse(previousDetailed.capturedAt)) / 86_400_000;
        daysSincePrevious = Number.isFinite(elapsed) && elapsed > 0 ? elapsed : null;
    }

    const followersGrowthPercent = followersDelta !== null && (previousDetailed?.followersCount ?? 0) > 0
        ? round((followersDelta / previousDetailed!.followersCount!) * 100)
        : null;
    const hasRateInterval = daysSincePrevious !== null && daysSincePrevious >= MIN_RATE_INTERVAL_DAYS;
    const followersPerDay = followersDelta !== null && hasRateInterval
        ? round(followersDelta / daysSincePrevious!, 2)
        : null;
    const likesPerDay = likesDelta !== null && hasRateInterval
        ? round(likesDelta / daysSincePrevious!, 2)
        : null;
    const postsPerWeek = videosDelta !== null && hasRateInterval
        ? round((videosDelta / daysSincePrevious!) * 7, 2)
        : null;
    const likesPerNewVideo = likesDelta !== null && videosDelta !== null && videosDelta > 0
        ? round(likesDelta / videosDelta, 2)
        : null;

    const growthSignals: string[] = [];
    if (hasRateInterval && (followersDelta ?? 0) > 0) growthSignals.push('followers_growing');
    if (hasRateInterval && (followersDelta ?? 0) < 0) growthSignals.push('followers_declining');
    if (hasRateInterval && followersGrowthPercent !== null && daysSincePrevious! <= 7) {
        if (followersGrowthPercent >= 5) growthSignals.push('follower_spike');
        if (followersGrowthPercent <= -5) growthSignals.push('follower_drop');
    }
    if ((videosDelta ?? 0) > 0) growthSignals.push('new_videos');
    if (changedFields.some((field) => ['displayName', 'bioText', 'websiteInBio', 'region'].includes(field))) {
        growthSignals.push('profile_updated');
    }
    if (changedFields.includes('verifiedBadge')) growthSignals.push('verification_changed');

    const trackingStatus: NonNullable<ProfileRecord['trackingStatus']> = profile.dataQuality === 'identity-only'
        ? 'partial'
        : !previousDetailed
            ? 'baseline'
            : changedFields.length > 0 ? 'updated' : 'unchanged';
    const nextObservationCount = (previousState?.observationCount ?? 0) + 1;
    const nextObservations = [...(previousState?.observations ?? []), current].slice(-historyLimit);
    const firstSeenAt = previousState?.firstSeenAt ?? profile.scrapedAt;
    const previousSeenAt = previousState?.observations.at(-1)?.capturedAt ?? null;

    return {
        profile: {
            ...profile,
            monitorName,
            trackingStatus,
            firstSeenAt,
            previousSeenAt,
            observationCount: nextObservationCount,
            changedFields,
            previousFollowersCount: previousDetailed?.followersCount ?? null,
            followersDelta,
            followersGrowthPercent,
            followersPerDay,
            previousTotalLikesReceived: previousDetailed?.totalLikesReceived ?? null,
            likesDelta,
            likesPerDay,
            previousTotalVideosCount: previousDetailed?.totalVideosCount ?? null,
            videosDelta,
            postsPerWeek,
            likesPerNewVideo,
            growthSignals,
        },
        state: {
            version: 1,
            firstSeenAt,
            observationCount: nextObservationCount,
            observations: nextObservations,
        },
    };
}

export async function loadProfileState(store: MonitorStore, username: string): Promise<ProfileMonitorState | null> {
    const value = await store.getValue<ProfileMonitorState>(monitorRecordKey(username));
    if (!value || value.version !== 1 || !Array.isArray(value.observations)) return null;
    return value;
}

export async function saveProfileState(
    store: MonitorStore,
    username: string,
    state: ProfileMonitorState,
): Promise<void> {
    await store.setValue(monitorRecordKey(username), state);
}
