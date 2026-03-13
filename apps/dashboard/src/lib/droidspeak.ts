const dictionary: Record<string, string> = {
  blk: 'Blocked on',
  need: 'Needs',
  dep: 'Depends on',
  next: 'Next',
  done: 'Completed',
  api: 'API',
  spec: 'spec',
  impl: 'implementation',
  be: 'backend',
  ui: 'UI',
  auth: 'auth',
  schema: 'schema',
  path: 'path',
};

const translateToken = (token: string): string => dictionary[token] ?? token.replace(/\+/g, ' and ');

export const translateDroidspeak = (input: string): string => {
  const clauses = input.split(';').map((clause) => clause.trim()).filter(Boolean);

  return clauses
    .map((clause) => {
      const [head, ...rest] = clause.split(/\s+/);
      const translatedRest = rest.map(translateToken).join(' ');
      const translatedHead = translateToken(head);
      return `${translatedHead}${translatedRest ? ` ${translatedRest}` : ''}.`;
    })
    .join(' ');
};
