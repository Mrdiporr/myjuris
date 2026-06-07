// Adjournment tracking types extracted from courtscribe-nexus
// Extends myjuris types with court-specific data

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unconfirmed';

export interface Marker {
  id: string;
  sessionId: string;
  createdAt: Date;
  timestampMs: number; // Offset from session start
  label: string;
  color?: string;
}

export interface Note {
  id: string;
  sessionId: string;
  createdAt: Date;
  timestampMs: number; // Offset from session start
  content: string;
}

export interface Adjournment {
  id: string;
  sessionId: string;
  createdAt: Date;
  timestampMs: number;
  
  // Manual entry fields
  nextDate?: string;
  reason?: string;
  
  // Confidence tracking
  confidence: ConfidenceLevel;
  confirmedAt?: Date;
  confirmedBy: 'user' | 'ai_suggested' | 'unconfirmed';
}
