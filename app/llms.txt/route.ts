import { source } from '@/lib/source';
import { llms } from 'fumadocs-core/source';

export const revalidate = false;

export function GET() {
  // fumadocs' default renderDescription stringifies non-page nodes, which emits
  // a literal "undefined" for folder/separator group labels (e.g. "Primitives:
  // undefined"). Return an empty description for those so the groups render clean.
  const text = llms(source, {
    renderDescription(node, ctx) {
      if (typeof node.description === 'string') return node.description;
      if (node.type === 'page') {
        return source.getNodePage(node, ctx.lang)?.data.description ?? '';
      }
      return '';
    },
  }).index();

  return new Response(text);
}
