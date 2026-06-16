import { SITE_URL } from './constants';

/** Strip MDX component tags and normalize links for machine-readable exports. */
export function sanitizeLlmMarkdown(raw: string): string {
  return absolutizeDocLinks(
    raw
      .replace(/^---\n[\s\S]*?\n---\n/, '')
      .replace(/^(import|export)\s.*$/gm, '')
      .replace(/<\/[A-Z][A-Za-z0-9]*>/g, '')
      .replace(/<[A-Z][A-Za-z0-9]*[^>]*\/>/g, '')
      .replace(/<[A-Z][A-Za-z0-9]*[^>]*>[\s\S]*?<\/[A-Z][A-Za-z0-9]*>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

export function absolutizeDocLinks(text: string): string {
  return text
    .replace(/\]\(\/docs\//g, `](${SITE_URL}/docs/`)
    .replace(/\]\(\/(privacy|terms|cookies|pricing)\)/g, `](${SITE_URL}/$1)`);
}

export function formatLlmsIndex(index: string): string {
  const withoutDuplicateTitle = index.replace(/^# Nenjo\s*/m, '').trim();
  return `# Documentation\n\n${withoutDuplicateTitle}`;
}