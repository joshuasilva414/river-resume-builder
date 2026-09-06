/** Address every nonblank line occurrence with bounded UTF-16 spans before generation. */
export function indexTextPassages(text: string) {
  const anchors: Array<{ index: number; quote: string; start: number; end: number }> = [];
  for (const line of text.matchAll(/[^\r\n]+/g)) {
    const limit = line.index + line[0].length;
    for (let start = line.index; start < limit; ) {
      let end = Math.min(start + 4000, limit);
      if (end < limit && /[\uD800-\uDBFF]/.test(text[end - 1] ?? "")) end--;
      const quote = text.slice(start, end);
      if (quote.trim()) anchors.push({ index: anchors.length, quote, start, end });
      start = end;
    }
  }
  return anchors;
}
