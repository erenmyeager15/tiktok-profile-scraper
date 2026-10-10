import type { ProfileRecord } from './types.js';

export interface MonitoringReportRow {
    username: string;
    displayName: string;
    profileUrl: string;
    dataQuality: ProfileRecord['dataQuality'];
    trackingStatus: ProfileRecord['trackingStatus'];
    observationCount: number | null;
    followersCount: number | null;
    followersDelta: number | null;
    followersGrowthPercent: number | null;
    followersPerDay: number | null;
    totalLikesReceived: number | null;
    likesDelta: number | null;
    likesPerDay: number | null;
    totalVideosCount: number | null;
    videosDelta: number | null;
    postsPerWeek: number | null;
    changedFields: string[];
    growthSignals: string[];
    observedAt: string;
}

export interface MonitoringReport {
    schemaVersion: 1;
    generatedAt: string;
    trackGrowth: boolean;
    monitorName: string | null;
    requestedProfiles: number;
    savedProfiles: number;
    failedProfiles: number;
    summary: {
        detailed: number;
        identityOnly: number;
        baselines: number;
        updated: number;
        unchanged: number;
        partial: number;
        stateWriteFailures: number;
        signals: Record<string, number>;
    };
    profiles: MonitoringReportRow[];
}

export function buildMonitoringReport(
    profiles: ProfileRecord[],
    requestedProfiles: number,
    trackGrowth: boolean,
    monitorName: string,
    stateWriteFailures: number,
): MonitoringReport {
    const rows = profiles.map((profile): MonitoringReportRow => ({
        username: profile.username,
        displayName: profile.displayName,
        profileUrl: profile.profileUrl,
        dataQuality: profile.dataQuality,
        trackingStatus: profile.trackingStatus ?? null,
        observationCount: profile.observationCount ?? null,
        followersCount: profile.followersCount,
        followersDelta: profile.followersDelta ?? null,
        followersGrowthPercent: profile.followersGrowthPercent ?? null,
        followersPerDay: profile.followersPerDay ?? null,
        totalLikesReceived: profile.totalLikesReceived,
        likesDelta: profile.likesDelta ?? null,
        likesPerDay: profile.likesPerDay ?? null,
        totalVideosCount: profile.totalVideosCount,
        videosDelta: profile.videosDelta ?? null,
        postsPerWeek: profile.postsPerWeek ?? null,
        changedFields: profile.changedFields ?? [],
        growthSignals: profile.growthSignals ?? [],
        observedAt: profile.scrapedAt,
    }));
    const signalCounts: Record<string, number> = {};
    for (const signal of rows.flatMap((row) => row.growthSignals)) {
        signalCounts[signal] = (signalCounts[signal] ?? 0) + 1;
    }

    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        trackGrowth,
        monitorName: trackGrowth ? monitorName : null,
        requestedProfiles,
        savedProfiles: rows.length,
        failedProfiles: requestedProfiles - rows.length,
        summary: {
            detailed: rows.filter((row) => row.dataQuality === 'detailed').length,
            identityOnly: rows.filter((row) => row.dataQuality === 'identity-only').length,
            baselines: rows.filter((row) => row.trackingStatus === 'baseline').length,
            updated: rows.filter((row) => row.trackingStatus === 'updated').length,
            unchanged: rows.filter((row) => row.trackingStatus === 'unchanged').length,
            partial: rows.filter((row) => row.trackingStatus === 'partial').length,
            stateWriteFailures,
            signals: signalCounts,
        },
        profiles: rows,
    };
}

const CSV_COLUMNS: (keyof MonitoringReportRow)[] = [
    'username', 'displayName', 'profileUrl', 'dataQuality', 'trackingStatus', 'observationCount',
    'followersCount', 'followersDelta', 'followersGrowthPercent', 'followersPerDay',
    'totalLikesReceived', 'likesDelta', 'likesPerDay', 'totalVideosCount', 'videosDelta',
    'postsPerWeek', 'changedFields', 'growthSignals', 'observedAt',
];

function safeCsvCell(value: unknown): string {
    const raw = Array.isArray(value) ? value.join('|') : value === null || value === undefined ? '' : String(value);
    const formulaSafe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${formulaSafe.replaceAll('"', '""')}"`;
}

export function monitoringReportCsv(report: MonitoringReport): string {
    const lines = [CSV_COLUMNS.map(safeCsvCell).join(',')];
    for (const row of report.profiles) {
        lines.push(CSV_COLUMNS.map((column) => safeCsvCell(row[column])).join(','));
    }
    return `${lines.join('\r\n')}\r\n`;
}
