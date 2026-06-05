export type LegalPage = {
  slug: string;
  title: string;
  summary: string;
  sections: { title: string; body: string }[];
};

export const legalPages: LegalPage[] = [
  {
    slug: 'fair-housing',
    title: 'Fair Housing Notice',
    summary: 'Equal housing access and non-discrimination expectations for the platform.',
    sections: [
      {
        title: 'Equal access',
        body: 'This platform supports equal housing opportunity. Listings, recommendations, inquiries, and agent follow-up should not discriminate based on protected characteristics under federal, state, or local fair housing laws.'
      },
      {
        title: 'User and partner conduct',
        body: 'Agents and housing partners should respond to inquiries consistently and should not steer users toward or away from housing because of protected status. Students may compare listings by price, commute, availability, fees, and verified building attributes.'
      }
    ]
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    summary: 'How lead information and product analytics are collected in the trial version.',
    sections: [
      {
        title: 'Information collected',
        body: 'Lead forms may collect name, WeChat, school, budget, move-in timing, interested unit, and notes. Product analytics may collect page views, listing clicks, unit clicks, share clicks, comparison actions, and contact clicks.'
      },
      {
        title: 'Use of information',
        body: 'Information is used to respond to rental inquiries, improve listing quality, measure partner performance, and maintain the product. The trial version stores development data locally unless a CRM or database integration is configured.'
      }
    ]
  },
  {
    slug: 'fees-disclaimer',
    title: 'Fees Disclaimer',
    summary: 'Rent, fee, guarantor, and move-in cost estimates must be confirmed.',
    sections: [
      {
        title: 'Rent and fees',
        body: 'Rent, concessions, broker fees, amenity fees, deposits, application fees, utility estimates, and move-in costs are informational estimates. Users should confirm all amounts with the agent, owner, official site, or property management before applying or signing.'
      },
      {
        title: 'Guarantor requirements',
        body: 'Many New York rentals require the renter or guarantor to show annual income around 35 times monthly rent. If that standard is not met, a third-party guarantor company may charge a non-refundable fee based on credit and application profile, often capped around one month of rent. This is not legal or financial advice.'
      }
    ]
  },
  {
    slug: 'data-disclaimer',
    title: 'Data Disclaimer',
    summary: 'Listing data, POIs, commute rings, and availability are discovery tools.',
    sections: [
      {
        title: 'Listing data',
        body: 'Building and unit data may come from official websites, supplied CSV files, prior public scrapes, Google Places, OpenStreetMap, and partner submissions. Availability and pricing can change quickly and should be reconfirmed.'
      },
      {
        title: 'Map and commute estimates',
        body: 'Map locations, nearby places, commute rings, walking times, and subway travel estimates are approximate and should not be treated as guarantees.'
      }
    ]
  },
  {
    slug: 'platform-role',
    title: 'Platform Role',
    summary: 'The platform is an information, comparison, and lead submission tool.',
    sections: [
      {
        title: 'Not a payment or lease platform',
        body: 'The platform does not collect rent, collect deposits, sign leases, guarantee approval, or act as property management. Any lease, deposit, application, or payment process happens directly with the relevant licensed party or property manager.'
      },
      {
        title: 'Partner listings',
        body: 'Agents and listing partners may provide information for publication. The platform may format, translate, normalize, and maintain the information for student-facing discovery.'
      }
    ]
  },
  {
    slug: 'contact-consent',
    title: 'Lead Contact Consent',
    summary: 'Users submitting inquiries consent to relevant follow-up.',
    sections: [
      {
        title: 'Consent',
        body: 'By submitting an inquiry, the user requests contact about the selected building or unit and agrees that the platform or relevant agent may follow up using the submitted contact information.'
      },
      {
        title: 'No guarantee',
        body: 'Submitting an inquiry does not reserve a unit, guarantee availability, or guarantee approval.'
      }
    ]
  },
  {
    slug: 'maps-data',
    title: 'Google and Map Data',
    summary: 'Map and nearby place data sources used in the product.',
    sections: [
      {
        title: 'Map sources',
        body: 'The map may use Leaflet, OpenStreetMap, CARTO map tiles, OpenRailwayMap overlays, and cached Google Places results. Third-party map data is subject to its own terms and update cadence.'
      },
      {
        title: 'Google Places security',
        body: 'Google Places API keys must remain server-side, restricted by API and allowed origins, and protected with quota and budget alerts. Cached nearby place tables should be refreshed on a planned schedule such as monthly.'
      }
    ]
  }
];

export function getLegalPage(slug: string) {
  return legalPages.find(page => page.slug === slug);
}
