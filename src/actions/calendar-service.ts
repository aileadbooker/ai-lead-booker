import { google } from 'googleapis';
import { config } from '../config';
import { Booking, BookingResult, Lead, CalendarSlot } from '../types';
import db from '../config/database';
import { v4 as uuidv4 } from 'uuid';

/**
 * Google Calendar Service with double-book protection
 */
export class GoogleCalendarService {
    private calendar: any;
    private oauth2Client: any;

    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            config.googleClientId,
            config.googleClientSecret,
            'urn:ietf:wg:oauth:2.0:oob'
        );

        this.oauth2Client.setCredentials({
            refresh_token: config.googleRefreshToken,
        });

        this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    }

    /**
     * Create booking with double-book protection
     */
    async createBooking(lead: Lead, preferredTime?: Date): Promise<BookingResult> {
        try {
            // 1. Check for existing booking (double-book protection)
            const existingBooking = await db.query(
                `SELECT * FROM bookings 
         WHERE lead_id = $1 AND status = 'scheduled'`,
                [lead.id]
            );

            if (existingBooking.rows.length > 0) {
                console.warn(`Lead ${lead.email} already has a scheduled booking`);
                return {
                    success: false,
                    error: 'Lead already has a scheduled booking'
                };
            }

            // 2. Check calendar availability
            const slot = await this.findAvailableSlot(preferredTime);

            if (!slot) {
                return {
                    success: false,
                    error: 'No available slots found in the next 14 days'
                };
            }

            // 3. Create calendar event
            const qualificationSummary = await this.buildQualificationSummary(lead);

            const event = await this.calendar.events.insert({
                calendarId: config.googleCalendarId,
                requestBody: {
                    summary: `Sales Meeting - ${lead.name || lead.email}`,
                    description: qualificationSummary,
                    start: {
                        dateTime: slot.start.toISOString(),
                        timeZone: 'America/New_York',
                    },
                    end: {
                        dateTime: slot.end.toISOString(),
                        timeZone: 'America/New_York',
                    },
                    attendees: [
                        { email: lead.email },
                    ],
                    reminders: {
                        useDefault: false,
                        overrides: [
                            { method: 'email', minutes: 24 * 60 },
                            { method: 'popup', minutes: 30 },
                        ],
                    },
                },
                sendUpdates: 'all', // Send calendar invite
            });

            const externalEventId = event.data.id;

            // 4. Store booking in database
            const bookingId = uuidv4();
            await db.query(
                `INSERT INTO bookings (id, lead_id, external_event_id, scheduled_at, duration_minutes, qualification_summary, status)
         VALUES ($1, $2, $3, $4, 30, $5, 'scheduled')`,
                [bookingId, lead.id, externalEventId, slot.start, qualificationSummary]
            );

            // 5. Update lead status
            await db.query(
                `UPDATE leads SET status = 'booked', updated_at = datetime('now') WHERE id = $1`,
                [lead.id]
            );

            console.log(`Booking created for ${lead.email} at ${slot.start}`);

            return {
                success: true,
                eventId: externalEventId,
                time: slot.start,
            };

        } catch (error) {
            console.error('Error creating booking:', error);
            return {
                success: false,
                error: String(error),
            };
        }
    }

    /**
     * Find available calendar slot
     */
    private async findAvailableSlot(preferredTime?: Date): Promise<CalendarSlot | null> {
        const now = new Date();
        const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

        // Query free/busy information
        const response = await this.calendar.freebusy.query({
            requestBody: {
                timeMin: now.toISOString(),
                timeMax: twoWeeksLater.toISOString(),
                items: [{ id: config.googleCalendarId }],
            },
        });

        const busySlots = response.data.calendars[config.googleCalendarId]?.busy || [];

        // Find first available 30-minute slot during business hours
        const slot = this.searchForSlot(now, twoWeeksLater, busySlots, preferredTime);

        return slot;
    }

    /**
     * Search for available 30-minute slot
     */
    private searchForSlot(
        start: Date,
        end: Date,
        busySlots: any[],
        preferredTime?: Date
    ): CalendarSlot | null {
        const duration = 30 * 60 * 1000; // 30 minutes in ms

        // Start search from preferredTime or next business hour
        let current = preferredTime || this.getNextBusinessHour(start);

        while (current < end) {
            const slotEnd = new Date(current.getTime() + duration);

            // Check if slot overlaps with any busy period
            const isAvailable = !busySlots.some((busy) => {
                const busyStart = new Date(busy.start);
                const busyEnd = new Date(busy.end);
                return current < busyEnd && slotEnd > busyStart;
            });

            if (isAvailable && this.isBusinessHours(current)) {
                return {
                    start: current,
                    end: slotEnd,
                };
            }

            // Move to next 30-minute increment
            current = new Date(current.getTime() + 30 * 60 * 1000);
        }

        return null;
    }

    /**
     * Check if time is within business hours (9 AM - 5 PM)
     */
    private isBusinessHours(date: Date): boolean {
        const hour = date.getHours();
        const day = date.getDay();

        // Weekday check (Monday-Friday)
        if (day === 0 || day === 6) {
            return false;
        }

        // Hour check (9 AM - 5 PM, but leave buffer for 30min meetings)
        return hour >= 9 && hour < 17;
    }

    /**
     * Get next business hour from given date
     */
    private getNextBusinessHour(from: Date): Date {
        const next = new Date(from);

        // Round up to next hour
        next.setMinutes(0, 0, 0);
        next.setHours(next.getHours() + 1);

        // If outside business hours, move to next day's 9 AM
        if (!this.isBusinessHours(next)) {
            next.setHours(9, 0, 0, 0);
            next.setDate(next.getDate() + 1);

            // Skip weekends
            while (next.getDay() === 0 || next.getDay() === 6) {
                next.setDate(next.getDate() + 1);
            }
        }

        return next;
    }

    /**
     * Build qualification summary for calendar event
     */
    private async buildQualificationSummary(lead: Lead): Promise<string> {
        // Get latest LLM decision
        const result = await db.query(
            `SELECT * FROM llm_decisions 
       WHERE lead_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
            [lead.id]
        );

        if (result.rows.length === 0) {
            return `Lead: ${lead.name || lead.email}\nEmail: ${lead.email}\nNo qualification data available.`;
        }

        const decision = result.rows[0];
        const scores = decision.qualification_scores || {};

        return `Lead: ${lead.name || lead.email}
Email: ${lead.email}
Company: ${lead.company || 'N/A'}
Phone: ${lead.phone || 'N/A'}

Qualification Scores:
- Budget: ${scores.budget || 'N/A'}
- Intent: ${scores.intent || 'N/A'}
- Urgency: ${scores.urgency || 'N/A'}
- Fit: ${scores.fit || 'N/A'}

Confidence: ${decision.confidence}%

Reasoning: ${decision.reasoning}`;
    }

    /**
     * Cancel booking
     */
    async cancelBooking(bookingId: string): Promise<boolean> {
        try {
            const result = await db.query(
                'SELECT * FROM bookings WHERE id = $1',
                [bookingId]
            );

            if (result.rows.length === 0) {
                return false;
            }

            const booking = result.rows[0];

            // Delete from Google Calendar
            await this.calendar.events.delete({
                calendarId: config.googleCalendarId,
                eventId: booking.external_event_id,
                sendUpdates: 'all',
            });

            // Update database
            await db.query(
                `UPDATE bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = $1`,
                [bookingId]
            );

            return true;
        } catch (error) {
            console.error('Error cancelling booking:', error);
            return false;
        }
    }
}

export default new GoogleCalendarService();
