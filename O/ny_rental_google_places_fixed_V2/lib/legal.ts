// Legal / compliance content for the rental discovery platform.
//
// IMPORTANT: This is an industry-aligned TEMPLATE drafted to cover the topics a
// commercial NYC rental site is expected to address (Terms, Privacy under
// CCPA/NY SHIELD, Fair Housing, NY agency & Standardized Operating Procedures,
// ADA accessibility, cookies, disclaimers). It is NOT legal advice and MUST be
// reviewed and finalized by qualified counsel before production use. Replace the
// bracketed placeholders ([Operator legal name], emails, addresses) with real
// values.

export type LegalSection = {
  title: string;
  body: string[];
  bullets?: string[];
};

export type LegalPage = {
  slug: string;
  title: string;
  summary: string;
  effectiveDate?: string;
  sections: LegalSection[];
};

const EFFECTIVE_DATE = 'June 9, 2026';
const OPERATOR = '[Operator legal name] ("we", "us", "the Operator")';
const PRIVACY_EMAIL = '[privacy@your-domain.example]';
const CONTACT_EMAIL = '[contact@your-domain.example]';

export const legalPages: LegalPage[] = [
  {
    slug: 'terms',
    title: 'Terms of Service',
    summary: 'The agreement governing your use of this rental discovery platform.',
    effectiveDate: EFFECTIVE_DATE,
    sections: [
      {
        title: 'Acceptance of these terms',
        body: [
          `These Terms of Service ("Terms") form a binding agreement between you and ${OPERATOR} and govern your access to and use of this website and related services (the "Service").`,
          'By accessing or using the Service you agree to these Terms and to our Privacy Policy. If you do not agree, do not use the Service.'
        ]
      },
      {
        title: 'What the Service is',
        body: [
          'The Service is an information, search, and comparison tool that helps students discover rental housing near New York City campuses. It aggregates and formats listing information and surfaces estimates such as commute ranges, nearby places, and shared-rent scenarios.',
          'The Service is not a landlord, property manager, mortgage lender, or escrow agent, and unless expressly stated in a separate written disclosure, it does not act as your real estate broker. Any lease, application, deposit, or payment occurs directly between you and the relevant licensed party or property owner.'
        ]
      },
      {
        title: 'Eligibility and accounts',
        body: [
          'You must be at least 18 years old and able to form a binding contract to use the Service. You are responsible for the accuracy of information you submit and for maintaining the confidentiality of any credentials issued to you.'
        ]
      },
      {
        title: 'Acceptable use',
        body: ['You agree not to:'],
        bullets: [
          'use the Service for any unlawful, discriminatory, or fraudulent purpose;',
          'scrape, harvest, or bulk-download data except as expressly permitted;',
          'submit false, misleading, or third-party personal information without authorization;',
          'interfere with, overload, or attempt to gain unauthorized access to the Service or its data;',
          'reproduce, resell, or create derivative works from the Service without written permission.'
        ]
      },
      {
        title: 'Listings and third-party content',
        body: [
          'Listing details, pricing, availability, photos, points of interest, and map data may be provided by landlords, agents, prior public sources, and third-party services. We do not independently verify all content and do not guarantee its accuracy, completeness, or current availability.',
          'References to third parties are not endorsements. Your dealings with any landlord, agent, or third party are solely between you and that party.'
        ]
      },
      {
        title: 'Intellectual property',
        body: [
          'The Service, including its software, design, text, and compilation of data, is owned by the Operator or its licensors and is protected by intellectual property laws. Third-party map and place data remain subject to their own licenses and terms.'
        ]
      },
      {
        title: 'Disclaimers',
        body: [
          'THE SERVICE AND ALL CONTENT ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. Estimates (rent splits, commute times, distances, fees) are informational and not guarantees.'
        ]
      },
      {
        title: 'Limitation of liability',
        body: [
          'TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE OPERATOR WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS OR DATA, ARISING FROM YOUR USE OF THE SERVICE. Our aggregate liability for any claim is limited to the greater of the amount you paid us (if any) in the preceding 12 months or USD $100.'
        ]
      },
      {
        title: 'Indemnification',
        body: [
          'You agree to indemnify and hold the Operator harmless from claims arising out of your use of the Service, your content, or your violation of these Terms or applicable law.'
        ]
      },
      {
        title: 'Governing law and disputes',
        body: [
          'These Terms are governed by the laws of the State of New York, without regard to conflict-of-laws rules. The parties submit to the exclusive jurisdiction of the state and federal courts located in New York. [If arbitration or a class-action waiver is desired, counsel should add the appropriate clause here.]'
        ]
      },
      {
        title: 'Changes and contact',
        body: [
          `We may update these Terms; material changes will be posted with a new effective date. Continued use after changes constitutes acceptance. Questions: ${CONTACT_EMAIL}.`
        ]
      }
    ]
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    summary: 'How we collect, use, share, and protect your information, including CCPA and NY SHIELD Act notes.',
    effectiveDate: EFFECTIVE_DATE,
    sections: [
      {
        title: 'Scope',
        body: [
          `This Privacy Policy explains how ${OPERATOR} handles personal information collected through the Service. It is intended to align with applicable U.S. state privacy laws, including the California Consumer Privacy Act (CCPA/CPRA) and the New York SHIELD Act.`
        ]
      },
      {
        title: 'Information we collect',
        body: ['We collect:'],
        bullets: [
          'Inquiry/lead details you submit: name, WeChat, school, budget, move-in timing, the unit of interest, and notes;',
          'Product analytics events: page views, listing/unit clicks, share clicks, comparison actions, filter use, and contact clicks;',
          'Technical/log data automatically generated when you use the Service, such as approximate request metadata used for security and abuse prevention.'
        ]
      },
      {
        title: 'How we use information',
        body: ['We use information to:'],
        bullets: [
          'respond to and route your rental inquiries to relevant landlords or agents;',
          'operate, secure, debug, and improve the Service;',
          'measure listing quality and partner performance in aggregate;',
          'comply with legal obligations and enforce our Terms.'
        ]
      },
      {
        title: 'How we share information',
        body: [
          'We do not sell your personal information. We share it only as needed to operate the Service:'
        ],
        bullets: [
          'with landlords/agents to fulfill the inquiry you initiate;',
          'with service providers acting on our behalf (for example, Google Sheets for record-keeping and Google Places/Maps for location features), under their terms;',
          'when required by law, or to protect rights, safety, and the integrity of the Service.'
        ]
      },
      {
        title: 'Data retention',
        body: [
          'We retain lead and analytics data only as long as necessary for the purposes described above or as required by law, after which it is deleted or de-identified. [Specify concrete retention periods with counsel.]'
        ]
      },
      {
        title: 'Your privacy rights',
        body: [
          'Depending on your residency, you may have rights to access, correct, delete, or obtain a portable copy of your personal information, and to opt out of certain processing. Because we do not sell personal information, there is no "sale" to opt out of. To exercise rights, contact us and we will verify and respond as required by law.'
        ],
        bullets: [
          `California (CCPA/CPRA): right to know, delete, correct, and non-discrimination for exercising rights.`,
          `New York (SHIELD Act): we maintain reasonable administrative, technical, and physical safeguards to protect private information.`,
          `Requests: ${PRIVACY_EMAIL}.`
        ]
      },
      {
        title: 'Data security',
        body: [
          'We use reasonable safeguards designed to protect personal information, including access controls and server-side handling of credentials and API keys. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.'
        ]
      },
      {
        title: "Children's privacy",
        body: [
          'The Service is intended for adults (18+) and is not directed to children under 13. We do not knowingly collect personal information from children.'
        ]
      },
      {
        title: 'Changes and contact',
        body: [
          `We may update this Policy; material changes will be posted with a new effective date. Questions or requests: ${PRIVACY_EMAIL}.`
        ]
      }
    ]
  },
  {
    slug: 'cookie-policy',
    title: 'Cookie Policy',
    summary: 'The cookies and local storage we use, and how to control them.',
    effectiveDate: EFFECTIVE_DATE,
    sections: [
      {
        title: 'What we use',
        body: [
          'We use a small number of cookies and browser storage mechanisms. We aim to keep these limited to what is necessary to run the Service.'
        ],
        bullets: [
          'Essential: a signed administrator session cookie (only for authorized operators logging into the admin panel).',
          'Functional (browser localStorage): your language preference and acknowledgement of our privacy notice.',
          'Analytics: usage events are recorded server-side and are not used to track you across other websites.'
        ]
      },
      {
        title: 'Managing cookies and storage',
        body: [
          'You can clear or block cookies and site data through your browser settings. Blocking essential cookies may prevent the admin panel from functioning; it will not stop you from browsing public listings.'
        ]
      },
      {
        title: 'Changes',
        body: [
          'If we introduce additional cookies or third-party tracking, we will update this policy and, where required, request consent.'
        ]
      }
    ]
  },
  {
    slug: 'fair-housing',
    title: 'Fair Housing Notice',
    summary: 'Equal housing opportunity and non-discrimination under federal, New York State, and NYC law.',
    effectiveDate: EFFECTIVE_DATE,
    sections: [
      {
        title: 'Equal housing opportunity',
        body: [
          'We support equal housing opportunity. Listings, recommendations, inquiries, and partner follow-up must not discriminate against any person on the basis of a protected characteristic under the federal Fair Housing Act, the New York State Human Rights Law, and the New York City Human Rights Law.'
        ]
      },
      {
        title: 'Protected characteristics',
        body: ['Protected classes include, depending on jurisdiction:'],
        bullets: [
          'race, color, national origin, religion, sex (including gender identity and sexual orientation), familial status, and disability (federal);',
          'age, marital status, military status, and lawful source of income, including housing vouchers (New York);',
          'additional protections under the NYC Human Rights Law, such as immigration/citizenship status and presence of children.'
        ]
      },
      {
        title: 'No steering or discriminatory conduct',
        body: [
          'Agents and housing partners must respond to inquiries consistently and must not steer users toward or away from housing because of a protected characteristic. Source-of-income discrimination, including refusal to accept lawful vouchers, is prohibited in New York.'
        ]
      },
      {
        title: 'Reporting discrimination',
        body: [
          'If you believe you have experienced housing discrimination, you may file a complaint with the U.S. Department of Housing and Urban Development (HUD), the New York State Division of Human Rights, or the New York City Commission on Human Rights.'
        ]
      }
    ]
  },
  {
    slug: 'agency-disclosure',
    title: 'Agency & Standardized Operating Procedures',
    summary: 'Our role, real estate agency relationships, and NY prospective-tenant procedures.',
    effectiveDate: EFFECTIVE_DATE,
    sections: [
      {
        title: 'Our role',
        body: [
          'Unless a separate written disclosure states otherwise, the Operator provides an information and discovery service and does not act as a licensed real estate broker or as your agent. Where licensed brokers or agents are involved, their agency relationships and disclosures are governed by their own licensing obligations.',
          '[If the Operator or its staff are licensed real estate professionals, replace this section with the required New York agency disclosure and license information, reviewed by counsel.]'
        ]
      },
      {
        title: 'Standardized Operating Procedures (NY RPL §442-h)',
        body: [
          'New York requires real estate brokerages to publish Standardized Operating Procedures for prospective homebuyers and renters. If a brokerage is involved in a transaction, typical procedures may include:'
        ],
        bullets: [
          'whether prospective tenants must show identification before a showing;',
          'whether an exclusive broker agreement is required;',
          'whether pre-approval, proof of income, or a credit check is required before showing or applying;',
          'application fees and who is responsible for broker fees.'
        ]
      },
      {
        title: 'Confirm with the licensed party',
        body: [
          'The items above are illustrative. Always confirm the actual procedures, fees, and agency relationships directly with the licensed broker, agent, or property manager handling a specific listing.'
        ]
      }
    ]
  },
  {
    slug: 'accessibility',
    title: 'Accessibility Statement',
    summary: 'Our commitment to making the Service usable for everyone (ADA / WCAG).',
    effectiveDate: EFFECTIVE_DATE,
    sections: [
      {
        title: 'Our commitment',
        body: [
          'We are committed to making the Service accessible to people with disabilities and aim to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA as a target standard, consistent with the goals of the Americans with Disabilities Act (ADA).'
        ]
      },
      {
        title: 'Measures and ongoing work',
        body: [
          'We work toward keyboard operability, sufficient color contrast, descriptive labels, focus management in dialogs, and screen-reader-friendly markup. Accessibility is an ongoing effort and we continue to improve.'
        ]
      },
      {
        title: 'Known limitations',
        body: [
          'Some interactive map features and third-party content may not be fully accessible. Where map-based discovery is a barrier, the listings page and building detail pages provide an alternative way to browse the same information.'
        ]
      },
      {
        title: 'Feedback and accommodations',
        body: [
          `If you encounter an accessibility barrier or need information in an alternative format, contact us at ${CONTACT_EMAIL} and we will work to provide the information or assistance you need.`
        ]
      }
    ]
  },
  {
    slug: 'fees-disclaimer',
    title: 'Fees & Pricing Disclaimer',
    summary: 'Rent, fees, guarantor, and move-in cost figures are estimates to confirm.',
    effectiveDate: EFFECTIVE_DATE,
    sections: [
      {
        title: 'Rent and fees',
        body: [
          'Rent, concessions, broker fees, amenity fees, deposits, application fees, utility estimates, shared-rent splits, and move-in totals shown on the Service are informational estimates. Confirm all amounts with the agent, owner, official site, or property management before applying or signing.'
        ]
      },
      {
        title: 'Shared-rent calculations',
        body: [
          'Per-person prices are generated by simple models (for example, an even split or a stepped split where each room tier differs by a fixed amount). They illustrate possibilities only and are not offers, quotes, or guarantees of any landlord, agent, or roommate arrangement.'
        ]
      },
      {
        title: 'Guarantor requirements',
        body: [
          'Many New York rentals require the renter or guarantor to show annual income around 35x monthly rent. If that standard is not met, a third-party guarantor company may charge a non-refundable fee based on credit and application profile, often capped around one month of rent. This is not legal or financial advice.'
        ]
      }
    ]
  },
  {
    slug: 'data-disclaimer',
    title: 'Listing Data Disclaimer',
    summary: 'Listing data, POIs, commute rings, and availability are discovery aids, not guarantees.',
    effectiveDate: EFFECTIVE_DATE,
    sections: [
      {
        title: 'Listing data',
        body: [
          'Building and unit data may come from official websites, supplied files, prior public sources, Google Places, OpenStreetMap, and partner submissions. Availability and pricing can change quickly and should be reconfirmed before you act.'
        ]
      },
      {
        title: 'Map and commute estimates',
        body: [
          'Map locations, nearby places, commute rings, walking times, and subway estimates are approximate and must not be treated as guarantees of distance, time, or routing.'
        ]
      }
    ]
  },
  {
    slug: 'platform-role',
    title: 'Platform Role',
    summary: 'The Service is an information, comparison, and inquiry tool.',
    effectiveDate: EFFECTIVE_DATE,
    sections: [
      {
        title: 'Not a payment or lease platform',
        body: [
          'The Service does not collect rent or deposits, sign leases, guarantee approval, or act as property management. Any lease, deposit, application, or payment happens directly with the relevant licensed party or property manager.'
        ]
      },
      {
        title: 'Partner listings',
        body: [
          'Agents and listing partners may provide information for publication. We may format, translate, normalize, and maintain that information for student-facing discovery, without assuming responsibility for its underlying accuracy.'
        ]
      }
    ]
  },
  {
    slug: 'contact-consent',
    title: 'Lead Contact Consent',
    summary: 'How inquiry contact and follow-up consent works.',
    effectiveDate: EFFECTIVE_DATE,
    sections: [
      {
        title: 'Consent to be contacted',
        body: [
          'By submitting an inquiry, you request contact about the selected building or unit and agree that the Operator or the relevant agent may follow up using the contact information you provide. You can ask us to stop contacting you at any time.'
        ]
      },
      {
        title: 'No guarantee',
        body: [
          'Submitting an inquiry does not reserve a unit, guarantee availability, or guarantee approval.'
        ]
      }
    ]
  },
  {
    slug: 'maps-data',
    title: 'Google & Map Data',
    summary: 'Map and nearby-place data sources and their handling.',
    effectiveDate: EFFECTIVE_DATE,
    sections: [
      {
        title: 'Map sources',
        body: [
          'The map may use Leaflet, OpenStreetMap, CARTO map tiles, OpenRailwayMap overlays, and cached Google Places results. Third-party map data is subject to its own terms and update cadence.'
        ]
      },
      {
        title: 'Google Places handling',
        body: [
          'Google Places API keys remain server-side, restricted by API and allowed origins, and protected with quota and budget controls. Cached nearby-place tables are refreshed on a planned schedule.'
        ]
      }
    ]
  }
];

export function getLegalPage(slug: string) {
  return legalPages.find(page => page.slug === slug);
}
