import { Lead, EmailThreadInfo } from '../types';
/**
 * Standard Email Service (SMTP/IMAP)
 * Replaces GmailService for production use without Google Cloud
 */
export declare class EmailService {
    private transporter;
    constructor();
    /**
     * Poll IMAP inbox for new unread messages
     */
    pollInbox(): Promise<Lead[]>;
    /**
     * Process a single IMAP message
     */
    private processMessage;
    /**
     * Get or create lead by email
     */
    private getOrCreateLead;
    /**
     * Get the appropriate transporter (OAuth or SMTP)
     */
    private getTransporter;
    /**
     * Send email via SMTP
     */
    sendEmail(lead: Lead, subject: string, body: string, threadInfo?: EmailThreadInfo, attachments?: any[]): Promise<{
        sent: boolean;
        messageId?: string;
        reason?: string;
    }>;
    /**
     * Generate ICS Calendar Invite
     */
    generateCalendarInvite(event: {
        start: Date;
        durationMinutes: number;
        title: string;
        description: string;
        location?: string;
        url?: string;
    }, attendee: {
        name: string;
        email: string;
    }): string;
    /**
     * Get thread info for replying
     */
    getThreadInfo(leadId: string): Promise<EmailThreadInfo | null>;
    private rowToLead;
    sendAdminReport(subject: string, html: string): Promise<void>;
}
declare const _default: EmailService;
export default _default;
//# sourceMappingURL=email-service.d.ts.map