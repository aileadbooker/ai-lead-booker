import { Lead, EmailSendResult } from '../types';
/**
 * Email Sender with Shadow Mode Support and Threading
 */
export declare class EmailSender {
    /**
     * Send email with full safety checks and shadow mode support
     */
    sendMessage(lead: Lead, messageContent: string, subject?: string): Promise<EmailSendResult>;
    /**
     * Get business configuration
     */
    private getBusinessConfig;
}
declare const _default: EmailSender;
export default _default;
//# sourceMappingURL=email-sender.d.ts.map