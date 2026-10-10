import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMonitoringReport, monitoringReportCsv } from '../src/report.js';
import type { ProfileRecord } from '../src/types.js';

const profile: ProfileRecord = {
    username: 'demo',
    displayName: '=Demo Creator',
    bioText: 'Creator bio',
    followersCount: 1_100,
    followingCount: 10,
    totalLikesReceived: 5_700,
    totalVideosCount: 52,
    verifiedBadge: false,
    profileImageUrl: null,
    profileUrl: 'https://www.tiktok.com/@demo',
    region: 'US',
    websiteInBio: 'https://example.com',
    isPrivate: false,
    scrapedAt: '2026-10-08T00:00:00.000Z',
    dataQuality: 'detailed',
    monitorName: 'us-creators',
    trackingStatus: 'updated',
    observationCount: 2,
    changedFields: ['followersCount', 'totalVideosCount'],
    followersDelta: 100,
    followersGrowthPercent: 10,
    followersPerDay: 14.29,
    likesDelta: 700,
    likesPerDay: 100,
    videosDelta: 2,
    postsPerWeek: 2,
    growthSignals: ['followers_growing', 'new_videos'],
};

test('builds a deterministic monitoring summary', () => {
    const report = buildMonitoringReport([profile], 2, true, 'us-creators', 0);
    assert.equal(report.savedProfiles, 1);
    assert.equal(report.failedProfiles, 1);
    assert.equal(report.summary.updated, 1);
    assert.equal(report.summary.detailed, 1);
    assert.deepEqual(report.summary.signals, { followers_growing: 1, new_videos: 1 });
    assert.equal(report.profiles[0].followersDelta, 100);
});

test('creates formula-safe spreadsheet output', () => {
    const csv = monitoringReportCsv(buildMonitoringReport([profile], 1, true, 'us-creators', 0));
    assert.match(csv, /^"username","displayName"/);
    assert.match(csv, /"'=Demo Creator"/);
    assert.match(csv, /"followers_growing\|new_videos"/);
});
