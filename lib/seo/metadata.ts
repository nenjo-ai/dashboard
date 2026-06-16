import type { Metadata } from 'next';
import { SITE_PREVIEW_TITLE } from './constants';

type PageSocialMetadata = {
  path: string;
  title: string;
  description: string;
};

/** Per-route Open Graph + Twitter overrides (root layout defaults to homepage). */
export function pageSocialMetadata({
  path,
  title,
  description,
}: PageSocialMetadata): Pick<Metadata, 'openGraph' | 'twitter'> {
  const ogTitle = title.includes('Nenjo') ? title : `${title} | Nenjo`;

  return {
    openGraph: {
      type: 'website',
      url: path,
      siteName: 'Nenjo',
      title: ogTitle,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
    },
  };
}

export function homeSocialMetadata(description: string): Pick<Metadata, 'openGraph' | 'twitter'> {
  return pageSocialMetadata({
    path: '/',
    title: SITE_PREVIEW_TITLE,
    description,
  });
}