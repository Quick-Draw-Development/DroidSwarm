import { generateGlyphSentence } from './glyph-generator';

// Encode structured payload into Droidspeak format
export function encodeDroidspeak(
  d1: string, 
  d2: string, 
  d11: string,
  m: string,
  prj: string,
  payload?: any
): string {
  const glyphSentence = generateGlyphSentence(d1, d2, d11, m, prj);
  
  // Create the envelope structure
  const envelope = {
    glyph_sentence: glyphSentence,
    payload: payload ? JSON.stringify(payload) : ""
  };
  
  return JSON.stringify(envelope);
}

// Encode structured data with more complex envelope
export function encodeDroidspeakEnvelope(
  id: string,
  projectId: string,
  d1: string, 
  d2: string, 
  d11: string,
  m: string,
  payload?: any
): string {
  const glyphSentence = generateGlyphSentence(d1, d2, d11, m, projectId);
  
  // Create the envelope structure
  const envelope = {
    id,
    projectId,
    glyph_sentence: glyphSentence,
    payload: payload ? JSON.stringify(payload) : ""
  };
  
  return JSON.stringify(envelope);
}
