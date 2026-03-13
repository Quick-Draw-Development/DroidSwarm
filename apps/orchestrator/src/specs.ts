import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

type SpecKey = 'orchestrator' | 'agent' | 'droidspeak';

export interface SpecCards {
  orchestrator: string;
  agent: string;
  droidspeak: string;
  all: Record<string, string>;
}

const CARD_FILES: Record<SpecKey, string> = {
  orchestrator: 'orchestrator-card.md',
  agent: 'agent-card.md',
  droidspeak: 'droidspeak-card.md',
};

let cachedSpecDir: string | null = null;
let cachedCards: SpecCards | null = null;

const safeReadCard = (specDir: string, fileName: string): string => {
  const cardPath = path.resolve(specDir, fileName);
  if (!existsSync(cardPath)) {
    return '';
  }

  return readFileSync(cardPath, 'utf8').trim();
};

export const loadSpecCards = (specDir: string): SpecCards => {
  const resolved = path.resolve(specDir);
  if (cachedSpecDir === resolved && cachedCards) {
    return cachedCards;
  }

  const cards: Record<string, string> = {};
  for (const [key, fileName] of Object.entries(CARD_FILES) as Array<[SpecKey, string]>) {
    cards[key] = safeReadCard(resolved, fileName);
  }

  cachedSpecDir = resolved;
  cachedCards = {
    orchestrator: cards.orchestrator || '',
    agent: cards.agent || '',
    droidspeak: cards.droidspeak || '',
    all: cards,
  };

  return cachedCards;
};
