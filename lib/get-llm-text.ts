import { source } from '@/lib/source';
import { sanitizeLlmMarkdown } from '@/lib/seo/llms-text';
import type { InferPageType } from 'fumadocs-core/source';

export async function getLLMText(page: InferPageType<typeof source>) {
  const raw = await page.data.getText('raw');

  return `# ${page.data.title} (${page.url})

${sanitizeLlmMarkdown(raw)}`;
}