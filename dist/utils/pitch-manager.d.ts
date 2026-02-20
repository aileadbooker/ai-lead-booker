/**
 * Pitch Manager - Loads custom pitch templates from database
 */
export declare class PitchManager {
    private static cachedPitch;
    /**
     * Get custom pitch configuration
     */
    static getPitch(): Promise<any>;
    /**
     * Get AI-recommended defaults
     */
    static getDefaults(): {
        initial_pitch: string;
        yes_response: string;
        no_response: string;
        yes_2_response: string;
        no_2_response: string;
    };
    /**
     * Clear cache (call this after pitch updates)
     */
    static clearCache(): void;
    /**
     * Replace {{name}} placeholder
     */
    static replaceName(text: string, name: string): string;
}
//# sourceMappingURL=pitch-manager.d.ts.map