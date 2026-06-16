import { source } from '@/lib/source';
import { llms } from 'fumadocs-core/source';
import { absolutizeDocLinks, formatLlmsIndex } from '@/lib/seo/llms-text';

export const revalidate = false;

export function GET() {
  // fumadocs' default renderDescription stringifies non-page nodes, which emits
  // a literal "undefined" for folder/separator group labels (e.g. "Primitives:
  // undefined"). Return an empty description for those so the groups render clean.
  const index = llms(source, {
    renderDescription(node, ctx) {
      if (typeof node.description === 'string') return node.description;
      if (node.type === 'page') {
        return source.getNodePage(node, ctx.lang)?.data.description ?? '';
      }
      return '';
    },
  }).index();

  const preamble = `# Nenjo

> Zero-trust platform for building and running teams of AI agents — together, on your terms.

- Website: https://nenjo.ai
- Documentation: https://nenjo.ai/docs
- Full corpus: https://nenjo.ai/llms-full.txt
- Preferred citation: https://nenjo.ai/docs
- Contact: hello@nenjo.ai

`;

  const text = formatLlmsIndex(absolutizeDocLinks(index));

  return new Response(preamble + text);
}