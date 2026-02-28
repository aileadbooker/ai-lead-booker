/**
 * Core TypeScript type definitions for AI Lead Booker System
 */

// ============================================================================
// Lead Types
// ============================================================================

export type LeadSource = 'email' | 'webform' | 'outbound_campaign' | 'web_scrape';

export type LeadStatus =
    | 'new'
    | 'qualifying'
    | 'awaiting_response'
    | 'ready_to_book'
    | 'booked'
    | 'escalated'
    | 'closed';

export interface Lead {
    id: string;
    workspace_id: string;
    email: string;
    name?: string;
    phone?: string;
    company?: string;
    source: LeadSource;
    status: LeadStatus;
    opted_out: boolean;
    last_contact_at?: Date;
    next_action_at?: Date; // For follow-up queue
    followup_count: number;
    created_at: Date;
    updated_at: Date;
}

// ============================================================================
// Message and Threading Types
// ============================================================================

export type MessageDirection = 'inbound' | 'outbound';

export interface Message {
    id: string;
    lead_id: string;
    direction: MessageDirection;
    gmail_thread_id?: string; // Gmail threading
    message_id?: string; // Standard email Message-ID
    in_reply_to?: string; // Email threading header
    subject: string;
    body: string;
    sent_at: Date;
}

// ============================================================================
// Conversation Types
// ============================================================================

export type ConversationState =
    | 'new'
    | 'qualifying'
    | 'clarifying'
    | 'ready_to_book'
    | 'booked'
    | 'closed';

export interface Conversation {
    id: string;
    lead_id: string;
    state: ConversationState;
    updated_at: Date;
}

// ============================================================================
// LLM Decision Types (Structured Output)
// ============================================================================

export type LLMAction =
    | 'qualify'
    | 'ask_clarification'
    | 'send_booking_link'
    | 'escalate'
    | 'nurture'
    | 'disqualify'
    | 'book';

export interface QualificationScores {
    budget: number; // 0-100
    intent: number; // 0-100
    urgency: number; // 0-100
    fit: number; // 0-100
}

export interface LLMDecision {
    action: LLMAction;
    confidence: number; // 0-100
    missing_fields: string[];
    message_draft: string;
    reasoning: string;
    qualification_scores?: QualificationScores;
    fallback_used?: boolean; // True if JSON parse failed
}

export interface LLMDecisionRecord extends LLMDecision {
    id: string;
    lead_id: string;
    created_at: Date;
}

// ============================================================================
// Booking Types
// ============================================================================

export type BookingStatus = 'scheduled' | 'completed' | 'no_show' | 'cancelled';

export interface Booking {
    id: string;
    lead_id: string;
    external_event_id: string; // Google Calendar event ID
    scheduled_at: Date;
    duration_minutes: number;
    qualification_summary: string;
    status: BookingStatus;
    created_at: Date;
    updated_at: Date;
}

// ============================================================================
// Escalation Types
// ============================================================================

export interface Escalation {
    id: string;
    lead_id: string;
    reason: string;
    resolved: boolean;
    resolved_at?: Date;
    resolved_by?: string;
    created_at: Date;
}

// ============================================================================
// Business Configuration Types
// ============================================================================

export type ApprovalMode = 'shadow' | 'live';

export interface BusinessHours {
    start: string; // e.g., "09:00"
    end: string; // e.g., "17:00"
    timezone: string; // e.g., "America/New_York"
}

export interface BusinessConfig {
    id: string;
    business_name: string;
    brand_voice?: string;
    services?: string[];
    tone?: string;
    approval_mode: ApprovalMode;
    confidence_threshold: number; // 0-100
    required_fields: string[]; // e.g., ['budget', 'timeline', 'company']
    business_hours: BusinessHours;
    ai_disclosure_text?: string;
    escalation_email?: string;
    created_at: Date;
    updated_at: Date;
}

// ============================================================================
// Knowledge Base Types
// ============================================================================

export type KnowledgeType = 'service' | 'policy' | 'pricing' | 'disqualifier';

export interface KnowledgeBaseEntry {
    id: string;
    business_id: string;
    type: KnowledgeType;
    key: string;
    value: string;
    metadata?: Record<string, any>;
    created_at: Date;
    updated_at: Date;
}

// ============================================================================
// Rate Limiting Types
// ============================================================================

export type RateLimitPeriod = 'daily' | 'weekly';

export interface RateLimit {
    id: string;
    lead_id: string;
    period: RateLimitPeriod;
    count: number;
    reset_at: Date;
    updated_at: Date;
}

// ============================================================================
// Action Log Types
// ============================================================================

export interface ActionLog {
    id: string;
    lead_id?: string;
    action_type: string;
    details: Record<string, any>;
    created_at: Date;
}

// ============================================================================
// Safety Guardrails Types
// ============================================================================

export interface SafetyCheckResult {
    allowed: boolean;
    reason?: string;
}

// ============================================================================
// Email Types (Gmail API)
// ============================================================================

export interface EmailThreadInfo {
    gmail_thread_id: string;
    message_id: string;
    subject: string;
}

export interface EmailMessage {
    to: string;
    subject: string;
    body: string;
    threadId?: string; // Gmail thread ID
    inReplyTo?: string; // Standard email header
    references?: string; // Standard email header
}

// ============================================================================
// Calendar Types (Google Calendar)
// ============================================================================

export interface CalendarSlot {
    start: Date;
    end: Date;
}

export interface CalendarEvent {
    id: string;
    summary: string;
    description: string;
    start: Date;
    end: Date;
    attendees: string[];
}

// ============================================================================
// Service Response Types
// ============================================================================

export interface ServiceResult<T = any> {
    success: boolean;
    data?: T;
    error?: string;
}

export interface BookingResult {
    success: boolean;
    eventId?: string;
    time?: Date;
    error?: string;
}

export interface EmailSendResult {
    sent: boolean;
    reason?: string;
    messageId?: string;
}
