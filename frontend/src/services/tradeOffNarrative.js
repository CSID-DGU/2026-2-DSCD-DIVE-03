/** Split only at section headings at the beginning of a line.
 * A second mention of the heading inside a sentence must not create a new card.
 * Backend summary sections are delimited by blank lines.
 */
export function splitTradeOffNarrative(summary) {
  return String(summary || '분석 요약 정보가 없습니다.')
    .split(/(?=^(?:적합도 우선이라면|비용 우선이라면|종합적으로는))/gm)
    .map((part) => part.trim())
    .filter(Boolean);
}
