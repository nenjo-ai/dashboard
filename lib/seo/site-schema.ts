import { SITE_DESCRIPTION, SITE_URL } from './constants';

export function buildSiteSchemaGraph() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'Nenjo',
        legalName: 'Boon Labs LLC',
        url: SITE_URL,
        logo: `${SITE_URL}/pwa-icon-512.png`,
        email: 'hello@nenjo.ai',
        sameAs: ['https://github.com/nenjo-ai/nenjo'],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: 'Nenjo',
        url: SITE_URL,
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#software`,
        name: 'Nenjo',
        url: SITE_URL,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: ['Web', 'Linux', 'macOS'],
        description: SITE_DESCRIPTION,
        downloadUrl: 'https://github.com/nenjo-ai/nenjo',
        installUrl: `${SITE_URL}/docs/introduction/installation`,
        featureList: [
          'Client-side encryption',
          'Agent package manager',
          'Self-hosted workers',
          'Collaborative workspaces',
        ],
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          url: `${SITE_URL}/pricing`,
        },
        creator: { '@id': `${SITE_URL}/#organization` },
      },
    ],
  };
}