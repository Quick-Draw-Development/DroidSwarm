import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { translateDroidspeak, translateDroidspeakV2 } from './droidspeak';

describe('droidspeak translators', () => {
  it('renders structured droidspeak v2 state objects', () => {
    const result = translateDroidspeakV2({
      compact: 'handoff:ready',
      expanded: 'Handoff ready for coder.',
      kind: 'handoff_ready',
    });

    assert.equal(result.translation, 'Handoff ready for coder.');
    assert.equal(result.clauseCount, 1);
    assert.equal(result.badgeLabel, 'Handoff');
    assert.equal(result.compact, 'handoff:ready');
    assert.deepEqual(result.unknownTokens, []);
  });

  it('keeps legacy token parsing as a fallback', () => {
    const result = translateDroidspeak('blk dep-api; next impl-ui');

    assert.match(result.translation, /Blocked on/i);
    assert.match(result.translation, /Next step:/i);
  });
});
