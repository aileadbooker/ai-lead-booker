/**
 * Application configuration loaded from environment variables
 */
export declare const config: {
    readonly port: number;
    readonly nodeEnv: string;
    readonly databaseUrl: string;
    readonly openaiApiKey: string | undefined;
    readonly googleClientId: string | undefined;
    readonly googleClientSecret: string | undefined;
    readonly googleCallbackUrl: string;
    readonly googleRefreshToken: string;
    readonly googleCalendarId: string;
    readonly gmailUserEmail: string;
    readonly businessName: string;
    readonly businessConfigId: string;
    readonly useMockLlm: boolean;
    readonly enableRealEmail: boolean;
    readonly smtp: {
        readonly host: string;
        readonly port: number;
        readonly user: string;
        readonly pass: string;
    };
    readonly imap: {
        readonly host: string;
        readonly port: number;
        readonly user: string;
        readonly pass: string;
    };
    readonly sessionSecret: string;
};
/**
 * Validate required environment variables
 */
export declare function validateConfig(): {
    valid: boolean;
    missing: string[];
};
export default config;
//# sourceMappingURL=index.d.ts.map