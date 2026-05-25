export function extractNumberedSourceUrls(markdown: string): Map<string, string> {
  const urls = new Map<string, string>();
  const sources = markdown.split(/^##\s+Sources\s*$/m).at(1) ?? markdown;
  for (const match of sources.matchAll(/^(\d+)\.\s+\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/gm)) {
    urls.set(match[1], match[2]);
  }
  return urls;
}

export function normalizeCitationMarkdown(markdown: string): string {
  const sourceUrls = extractNumberedSourceUrls(markdown);
  if (!sourceUrls.size) return markdown;

  return markdown
    .split(/(```[\s\S]*?```)/g)
    .map(block => {
      if (block.startsWith("```")) return block;
      return block
        .split(/(\n\s*\n)/g)
        .map(paragraph => normalizeCitationParagraph(paragraph, sourceUrls))
        .join("");
    })
    .join("");
}

function normalizeCitationParagraph(paragraph: string, sourceUrls: Map<string, string>): string {
  const bareCitationNumbers = [...paragraph.matchAll(/\[(\d+)\](?!\()/g)]
    .map(match => match[1])
    .filter(number => sourceUrls.has(number));
  const withoutDuplicateLinks = bareCitationNumbers.length
    ? paragraph.replace(/\s+\[\d+\]\(https?:\/\/[^)\s]+\)/g, "").trimEnd()
    : paragraph;

  const linkedCitations = withoutDuplicateLinks.replace(/\[(\d+)\](?!\()/g, (match, number: string, offset: number) => {
    const priorBracket = withoutDuplicateLinks.slice(0, offset).match(/\[([^\]]+)\]$/);
    if (priorBracket && !/^\d+$/.test(priorBracket[1])) return match;
    const url = sourceUrls.get(number);
    return url ? `[${number}](${url})` : match;
  });
  return spaceAdjacentNumericCitationLinks(linkedCitations)
    .split(/(\n)/)
    .map(part => (part === "\n" ? part : dedupeNumericCitationLinks(part)))
    .join("");
}

function spaceAdjacentNumericCitationLinks(markdown: string): string {
  return markdown.replace(/(\[\d+\]\(https?:\/\/[^)\s]+\))(?=\[\d+\]\(https?:\/\/[^)\s]+\))/g, "$1 ");
}

function dedupeNumericCitationLinks(markdown: string): string {
  const seen = new Set<string>();
  return markdown
    .replace(/(\s*)\[(\d+)\]\((https?:\/\/[^)\s]+)\)/g, (match, leading: string, number: string, url: string) => {
      const key = `${number}\u0000${url}`;
      if (seen.has(key)) return "";
      seen.add(key);
      return `${leading}[${number}](${url})`;
    })
    .trimEnd();
}
