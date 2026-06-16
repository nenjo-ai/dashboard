import { source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { LastUpdated } from '@/components/docs/LastUpdated';
import { ResetDocsScroll } from '@/components/docs/ResetDocsScroll';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageSocialMetadata } from '@/lib/seo/metadata';
import { buildDocsSchemaGraph } from '@/lib/seo/docs-schema';

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const schemaGraph = buildDocsSchemaGraph(source.getPageTree(), page);

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      tableOfContent={{ style: 'clerk' }}
      tableOfContentPopover={{ style: 'clerk' }}
    >
      <JsonLd data={schemaGraph} />
      <ResetDocsScroll />
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      {page.data.lastModified ? (
        <LastUpdated value={page.data.lastModified} />
      ) : null}
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const slugPath = params.slug?.length ? params.slug.join('/') : '';
  const canonicalPath = slugPath ? `/docs/${slugPath}` : '/docs';
  const description = page.data.description ?? '';

  return {
    title: page.data.title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    ...pageSocialMetadata({
      path: canonicalPath,
      title: page.data.title,
      description,
    }),
  };
}
