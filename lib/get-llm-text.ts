import { source } from '@/lib/source';
import type { InferPageType } from 'fumadocs-core/source';

/**
 * Strip the YAML frontmatter block and any MDX `import`/`export` statements from
 * raw doc source. We use raw (not `getText('processed')`) because the processed
 * pipeline flattens `##`/`###` headings into plain `Heading [#slug]` lines, which
 * leaves llms-full.txt as one giant wall of H1s with no scannable hierarchy.
 */
function cleanRawMarkdown(raw: string): string {
  return raw
    .replace(/^---\n[\s\S]*?\n---\n/, '') // leading frontmatter
    .replace(/^(import|export)\s.*$/gm, '') // MDX import/export lines
    .replace(/\n{3,}/g, '\n\n') // collapse blank runs left behind
    .trim();
}

export async function getLLMText(page: InferPageType<typeof source>) {
  const raw = await page.data.getText('raw');

  return `# ${page.data.title} (${page.url})

${cleanRawMarkdown(raw)}`;
}
