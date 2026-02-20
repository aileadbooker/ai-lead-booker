import { Lead } from '../types';
/**
 * Escalation Handler - Routes leads to humans when necessary
 */
export declare class EscalationHandler {
    /**
     * Create escalation and notify human
     */
    escalate(lead: Lead, reason: string): Promise<void>;
    /**
     * Send escalation notification email
     */
    private sendEscalationNotification;
    /**
     * Check if lead should be escalated based on criteria
     */
    shouldEscalate(confidence: number, action: string, fallbackUsed: boolean): boolean;
    /**
     * Resolve escalation
     */
    resolveEscalation(escalationId: string, resolvedBy: string): Promise<void>;
}
declare const _default: EscalationHandler;
export default _default;
//# sourceMappingURL=escalation-handler.d.ts.map