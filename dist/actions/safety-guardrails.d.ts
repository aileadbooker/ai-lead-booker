import { Lead, SafetyCheckResult } from '../types';
/**
 * Safety Guardrails for AI Lead Booker
 * Pre-flight checks before sending messages or taking actions
 */
export declare class SafetyGuardrails {
    /**
     * Master safety check before ANY action
     */
    checkSafetyRules(lead: Lead, action: string): Promise<SafetyCheckResult>;
    /**
     * Check rate limits (daily and weekly)
     */
    private checkRateLimit;
    /**
     * Increment rate limit counters
     */
    incrementRateLimit(leadId: string): Promise<void>;
    /**
     * Check if current time is within business hours
     */
    private checkBusinessHours;
    /**
     * Detect opt-out requests in message content
     */
    detectOptOut(messageBody: string): boolean;
    /**
     * Process opt-out request
     */
    processOptOut(leadId: string): Promise<void>;
    /**
     * Get business configuration
     */
    private getBusinessConfig;
}
declare const _default: SafetyGuardrails;
export default _default;
//# sourceMappingURL=safety-guardrails.d.ts.map