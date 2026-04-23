import { DROIDSPEAK_CATALOGS } from './catalogs';

// Decode Droidspeak glyph sentence back to structured data
export function decodeDroidspeak(droidspeakString: string): any {
  try {
    const envelope = JSON.parse(droidspeakString);
    const { glyph_sentence, payload } = envelope;
    
    // Parse the glyph sentence
    const parts = glyph_sentence.split('|');
    const parsed: any = {};
    
    for (const part of parts) {
      const [key, value] = part.split(':');
      parsed[key] = value;
    }
    
    // Convert payload back to object if it exists
    if (payload && payload.length > 0) {
      parsed.payload = JSON.parse(payload);
    }
    
    return parsed;
  } catch (error) {
    throw new Error(`Failed to decode Droidspeak: ${error}`);
  }
}

// Decode Droidspeak envelope with full context
export function decodeDroidspeakEnvelope(droidspeakString: string): any {
  try {
    const envelope = JSON.parse(droidspeakString);
    
    // Parse the glyph sentence
    const parts = envelope.glyph_sentence.split('|');
    const parsed: any = {
      ...envelope
    };
    
    for (const part of parts) {
      const [key, value] = part.split(':');
      parsed[key] = value;
    }
    
    // Remove the glyph_sentence from the result since it's now parsed
    delete parsed.glyph_sentence;
    
    // Convert payload back to object if it exists
    if (envelope.payload && envelope.payload.length > 0) {
      parsed.payload = JSON.parse(envelope.payload);
    }
    
    return parsed;
  } catch (error) {
    throw new Error(`Failed to decode Droidspeak envelope: ${error}`);
  }
}
