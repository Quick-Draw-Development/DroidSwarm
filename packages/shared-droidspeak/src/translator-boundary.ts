// Translator boundary - enforces Droidspeak translation at key integration points

import { DroidspeakTranslator } from './translator';

// Interface for translator boundary
export interface TranslatorBoundary {
  toDroidspeak(input: string | object, context: { projectId: string, source: 'slack' | 'dashboard' | 'user' }): string;
  fromDroidspeak(droidspeakEnvelope: any, target: 'slack' | 'dashboard' | 'log'): string;
}

// Implementation of the translator boundary
export class DroidspeakTranslatorBoundary implements TranslatorBoundary {
  
  toDroidspeak(input: string | object, context: { projectId: string, source: 'slack' | 'dashboard' | 'user' }): string {
    // Translate natural language input to Droidspeak
    return DroidspeakTranslator.toDroidspeak(input, context);
  }
  
  fromDroidspeak(droidspeakEnvelope: any, target: 'slack' | 'dashboard' | 'log'): string {
    // Translate Droidspeak back to natural language for user-facing display
    return DroidspeakTranslator.fromDroidspeak(droidspeakEnvelope, target);
  }
}

// Singleton instance for use throughout the system
export const translatorBoundary = new DroidspeakTranslatorBoundary();
