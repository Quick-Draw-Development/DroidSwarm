"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cosineSimilarity = exports.buildEmbedding = void 0;
const buildEmbedding = (text, dimension = 16) => {
    const normalized = text ? text.toLowerCase().replace(/[^a-z0-9]+/g, ' ') : '';
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const vector = new Array(dimension).fill(0);
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
exports.buildEmbedding = buildEmbedding;
const cosineSimilarity = (a, b) => {
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
exports.cosineSimilarity = cosineSimilarity;
