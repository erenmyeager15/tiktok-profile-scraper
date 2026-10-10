import assert from 'node:assert/strict';
import test from 'node:test';
import {
    applyGrowthTracking,
    monitorRecordKey,
    monitorStoreName,
    type ProfileMonitorState,
} from '../src/monitor.js';
import type { ProfileRecord } from '../src/types.js';

function profile(overrides: Partial<ProfileRecord> = {}): ProfileRecord {
    return {
        username: 'demo',
        displayName: 'Demo Creator',
        bioText: 'Creator bio',
        followersCount: 1_000,
        followingCount: 10,
        totalLikesReceived: 5_000,
        totalVideosCount: 50,
        verifiedBadge: false,
        profileImageUrl: null,
        profileUrl: 'https://www.tiktok.com/@demo',
        region: 'US',
        websiteInBio: 'https://example.com',
        isPrivate: false,
        scrapedAt: '2026-10-01T00:00:00.000Z',
        dataQuality: 'detailed',
        ...overrides,
    };
}

test('creates a bounded baseline without inventing deltas', () => {
    const result = applyGrowthTracking(profile(), null, 'us-creators', 12);
    assert.equal(result.profile.trackingStatus, 'baseline');
    assert.equal(result.profile.followersDelta, null);
    assert.equal(result.profile.observationCount, 1);
    assert.deepEqual(result.profile.changedFields, []);
    assert.equal(result.state.observations.length, 1);
});

test('calculates creator growth and posting velocity against detailed history', () => {
    const baseline = applyGrowthTracking(profile(), null, 'us-creators', 12);
    const next = applyGrowthTracking(profile({
        followersCount: 1_100,
        totalLikesReceived: 5_700,
        totalVideosCount: 52,
        scrapedAt: '2026-10-08T00:00:00.000Z',
    }), baseline.state, 'us-creators', 12);

    assert.equal(next.profile.trackingStatus, 'updated');
    assert.equal(next.profile.followersDelta, 100);
    assert.equal(next.profile.followersGrowthPercent, 10);
    assert.equal(next.profile.followersPerDay, 14.29);
    assert.equal(next.profile.likesDelta, 700);
    assert.equal(next.profile.videosDelta, 2);
    assert.equal(next.profile.postsPerWeek, 2);
    assert.equal(next.profile.likesPerNewVideo, 350);
    assert.deepEqual(next.profile.growthSignals, ['followers_growing', 'follower_spike', 'new_videos']);
});

test('does not let identity-only fallback erase the detailed baseline', () => {
    const baseline = applyGrowthTracking(profile(), null, 'us-creators', 12);
    const partial = applyGrowthTracking(profile({
        followersCount: null,
        followingCount: null,
        totalLikesReceived: null,
        totalVideosCount: null,
        bioText: '',
        websiteInBio: null,
        scrapedAt: '2026-10-02T00:00:00.000Z',
        dataQuality: 'identity-only',
    }), baseline.state, 'us-creators', 12);
    const recovered = applyGrowthTracking(profile({
        followersCount: 1_010,
        scrapedAt: '2026-10-03T00:00:00.000Z',
    }), partial.state, 'us-creators', 12);

    assert.equal(partial.profile.trackingStatus, 'partial');
    assert.deepEqual(partial.profile.changedFields, []);
    assert.equal(recovered.profile.previousFollowersCount, 1_000);
    assert.equal(recovered.profile.followersDelta, 10);
});

test('labels a complete repeat unchanged', () => {
    const baseline = applyGrowthTracking(profile(), null, 'us-creators', 12);
    const repeat = applyGrowthTracking(profile({ scrapedAt: '2026-10-02T00:00:00.000Z' }), baseline.state, 'us-creators', 12);
    assert.equal(repeat.profile.trackingStatus, 'unchanged');
    assert.deepEqual(repeat.profile.changedFields, []);
    assert.deepEqual(repeat.profile.growthSignals, []);
});

test('suppresses short-interval count noise and does not annualize it', () => {
    const baseline = applyGrowthTracking(profile({
        followersCount: 9_022_431,
        totalLikesReceived: 108_329_695,
        scrapedAt: '2026-10-10T09:20:01.676Z',
    }), null, 'us-creators', 12);
    const repeat = applyGrowthTracking(profile({
        followersCount: 9_022_243,
        totalLikesReceived: 108_326_426,
        scrapedAt: '2026-10-10T09:20:37.482Z',
    }), baseline.state, 'us-creators', 12);

    assert.equal(repeat.profile.trackingStatus, 'unchanged');
    assert.equal(repeat.profile.followersDelta, null);
    assert.equal(repeat.profile.likesDelta, null);
    assert.equal(repeat.profile.followersPerDay, null);
    assert.equal(repeat.profile.likesPerDay, null);
    assert.deepEqual(repeat.profile.growthSignals, []);
});

test('waits at least one hour before calculating daily velocity', () => {
    const baseline = applyGrowthTracking(profile(), null, 'us-creators', 12);
    const repeat = applyGrowthTracking(profile({
        followersCount: 1_100,
        totalLikesReceived: 5_500,
        totalVideosCount: 51,
        scrapedAt: '2026-10-01T00:30:00.000Z',
    }), baseline.state, 'us-creators', 12);

    assert.equal(repeat.profile.trackingStatus, 'updated');
    assert.equal(repeat.profile.followersDelta, 100);
    assert.equal(repeat.profile.followersPerDay, null);
    assert.equal(repeat.profile.postsPerWeek, null);
    assert.deepEqual(repeat.profile.growthSignals, ['new_videos']);
});

test('retains a bounded history while preserving the lifetime observation count', () => {
    let state: ProfileMonitorState | null = null;
    for (let day = 1; day <= 5; day += 1) {
        const result = applyGrowthTracking(profile({
            scrapedAt: `2026-10-0${day}T00:00:00.000Z`,
            followersCount: 1_000 + day,
        }), state, 'us-creators', 2);
        state = result.state;
    }
    assert.equal(state.observationCount, 5);
    assert.equal(state.observations.length, 2);
    assert.equal(state.firstSeenAt, '2026-10-01T00:00:00.000Z');
});

test('hashes monitor and profile identifiers used in storage names', () => {
    assert.match(monitorStoreName('US Creators'), /^tiktok-growth-[a-f0-9]{24}$/);
    assert.match(monitorRecordKey('Demo'), /^PROFILE_[a-f0-9]{32}$/);
    assert.equal(monitorStoreName('US Creators'), monitorStoreName('us creators'));
    assert.equal(monitorRecordKey('Demo'), monitorRecordKey('demo'));
});
