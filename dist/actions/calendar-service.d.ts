import { BookingResult, Lead } from '../types';
/**
 * Google Calendar Service with double-book protection
 */
export declare class GoogleCalendarService {
    private calendar;
    private oauth2Client;
    constructor();
    /**
     * Create booking with double-book protection
     */
    createBooking(lead: Lead, preferredTime?: Date): Promise<BookingResult>;
    /**
     * Find available calendar slot
     */
    private findAvailableSlot;
    /**
     * Search for available 30-minute slot
     */
    private searchForSlot;
    /**
     * Check if time is within business hours (9 AM - 5 PM)
     */
    private isBusinessHours;
    /**
     * Get next business hour from given date
     */
    private getNextBusinessHour;
    /**
     * Build qualification summary for calendar event
     */
    private buildQualificationSummary;
    /**
     * Cancel booking
     */
    cancelBooking(bookingId: string): Promise<boolean>;
}
declare const _default: GoogleCalendarService;
export default _default;
//# sourceMappingURL=calendar-service.d.ts.map