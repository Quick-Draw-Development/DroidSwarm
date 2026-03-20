var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var embeddings_exports = {};
__export(embeddings_exports, {
  buildEmbedding: () => buildEmbedding,
  cosineSimilarity: () => cosineSimilarity
});
module.exports = __toCommonJS(embeddings_exports);
const buildEmbedding = (text, dimension = 16) => {
  const normalized = text ? text.toLowerCase().replace(/[^a-z0-9]+/g, " ") : "";
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const vector = new Array(dimension).fill(0);
  if (tokens.length === 0) {
    return vector;
  }
  tokens.forEach((token, index) => {
    let hash = 0;
    for (let char of token) {
      hash = hash * 31 + char.charCodeAt(0) & 4294967295;
    }
    vector[index % dimension] += Math.abs(hash) % 1e3;
  });
  const max = Math.max(...vector, 1);
  return vector.map((value) => value / max);
};
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildEmbedding,
  cosineSimilarity
});
