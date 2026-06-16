import { source } from '@/lib/source';
import { getLLMText } from '@/lib/get-llm-text';
import { SITE_URL } from '@/lib/seo/constants';

export const revalidate = false;

export async function GET() {
  const scanned = await Promise.all(source.getPages().map(getLLMText));

  return new Response(
    scanned
      .map((section) => section.trim())
      .join(`\n\n---\n\n`)
      .concat(`\n\nSource: ${SITE_URL}/llms-full.txt\n`),
  );
}