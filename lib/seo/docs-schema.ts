import { getBreadcrumbItems } from 'fumadocs-core/breadcrumb';
import type { InferPageType } from 'fumadocs-core/source';
import type { Root } from 'fumadocs-core/page-tree';
import type { source } from '@/lib/source';
import { SITE_URL } from './constants';

type DocsPage = InferPageType<typeof source>;

function toAbsoluteUrl(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function buildDocsBreadcrumbList(pageTree: Root, page: DocsPage) {
  const crumbs = getBreadcrumbItems(page.url, pageTree, {
    includePage: true,
    includeRoot: { url: '/docs' },
  });

  const items = [
    { name: 'Home', url: SITE_URL },
    ...crumbs
      .filter((crumb) => crumb.url)
      .map((crumb) => ({
        name: crumb.name,
        url: toAbsoluteUrl(crumb.url)!,
      })),
  ];

  return {
    '@type': 'BreadcrumbList',
    '@id': `${SITE_URL}${page.url}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function buildDocsTechArticle(page: DocsPage) {
  const pageUrl = `${SITE_URL}${page.url}`;

  return {
    '@type': 'TechArticle',
    '@id': `${pageUrl}#article`,
    headline: page.data.title,
    description: page.data.description,
    url: pageUrl,
    mainEntityOfPage: pageUrl,
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    author: { '@id': `${SITE_URL}/#organization` },
    inLanguage: 'en',
    ...(page.data.lastModified
      ? { dateModified: page.data.lastModified }
      : {}),
  };
}

export function buildDocsSchemaGraph(pageTree: Root, page: DocsPage) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      buildDocsBreadcrumbList(pageTree, page),
      buildDocsTechArticle(page),
    ],
  };
}