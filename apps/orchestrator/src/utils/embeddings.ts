export const buildEmbedding = (text: string, dimension = 16): number[] => {
  const normalized = text ? text.toLowerCase().replace(/[^a-z0-9]+/g, ' ') : '';
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const vector = new Array<number>(dimension).fill(0);
  if (tokens.length === 0) {
    return vector;
  }

  tokens.forEach((token, index) => {
    let hash = 0;
    for (let char of token) {
      hash = (hash * 31 + char.charCodeAt(0)) & 0xffffffff;
    }
    vector[index % dimension] += Math.abs(hash) % 1000;
  });

  const max = Math.max(...vector, 1);
  return vector.map((value) => value / max);
};

export const cosineSimilarity = (a: number[], b: number[]): number => {
  if (!a.length || !b.length) {
    return 0;
  }
  const minLength = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < minLength; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};
