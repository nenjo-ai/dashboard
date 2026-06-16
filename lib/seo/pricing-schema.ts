import { SITE_URL } from './constants';

export function buildPricingSchemaGraph() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${SITE_URL}/pricing#webpage`,
        url: `${SITE_URL}/pricing`,
        name: 'Pricing — Nenjo Cloud',
        description:
          'Free Hobbyist tier with encrypted dashboard and one worker. Team and enterprise plans.',
        isPartOf: { '@id': `${SITE_URL}/#website` },
      },
      {
        '@type': 'OfferCatalog',
        '@id': `${SITE_URL}/pricing#offers`,
        name: 'Nenjo Cloud Plans',
        itemListElement: [
          {
            '@type': 'Offer',
            name: 'Hobbyist',
            price: '0',
            priceCurrency: 'USD',
            availability: 'https://schema.org/InStock',
            url: `${SITE_URL}/dashboard/login`,
            description:
              '1 harness, 1 org member, encrypted dashboard, open-source runtime',
            itemOffered: { '@id': `${SITE_URL}/#software` },
          },
          {
            '@type': 'Offer',
            name: 'Professional',
            availability: 'https://schema.org/PreOrder',
            url: `${SITE_URL}/pricing`,
            description: 'Team plans — coming soon. Join waitlist.',
            itemOffered: { '@id': `${SITE_URL}/#software` },
          },
          {
            '@type': 'Offer',
            name: 'Enterprise',
            availability: 'https://schema.org/PreOrder',
            url: 'mailto:sales@nenjo.ai',
            description:
              'Commercial licensing, security review, and deployment support',
            itemOffered: { '@id': `${SITE_URL}/#software` },
          },
        ],
      },
    ],
  };
}