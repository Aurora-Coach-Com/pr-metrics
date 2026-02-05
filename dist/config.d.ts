/**
 * Configuration handling
 *
 * Reads from GitHub Action inputs when running as action,
 * or from environment variables when running standalone.
 */
export interface Thresholds {
    cycleTimeWarningHours: number;
    cycleTimeCriticalHours: number;
    reviewWarningHours: number;
    reviewCriticalHours: number;
    wipWarningRatio: number;
    wipCriticalRatio: number;
    concentrationWarning: number;
    concentrationCritical: number;
    reviewDepthWarning: number;
    reviewDepthCritical: number;
    prSizeWarning: number;
    prSizeCritical: number;
    buildSuccessWarning: number;
    buildSuccessCritical: number;
}
export interface Config {
    token: string;
    owner: string;
    repo: string;
    sprintLengthDays: number;
    periodStart: Date;
    periodEnd: Date;
    postAs: 'summary' | 'issue-comment';
    issueNumber?: number;
    auroraApiKey?: string;
    auroraTeamId?: string;
    workflowFilter?: string;
    deploymentEnvironment?: string;
    thresholds: Thresholds;
}
export declare function getConfig(): Config;
