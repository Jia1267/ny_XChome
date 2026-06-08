export type Language = 'en' | 'zh';

export type SchoolId = 'all' | 'columbia' | 'nyu' | 'baruch' | 'pratt';

export type CommuteMode = 'none' | 'walk5' | 'walk15' | 'subway20' | 'subway40' | 'subway60';

export type PoiType = 'restaurant' | 'grocery' | 'coffee' | 'subway';

export type TrustStatus = 'verified' | 'needs_confirmation' | 'provided' | 'unknown';

export type TrustInfo = {
  lastUpdated: string;
  sourceName: string;
  sourceUrl: string;
  priceStatus: TrustStatus;
  feeStatus: TrustStatus;
  availabilityStatus: TrustStatus;
  availabilityCheckedAt: string;
  contactId: string;
  contactName: string;
  contactMethod: string;
  updatedBy: string;
  internalNotes: string;
  verificationNote: string;
};

export type Contact = {
  id: string;
  name: string;
  role: string;
  company: string;
  email: string;
  phone: string;
  wechat: string;
  sourceName: string;
  internalNotes: string;
};

export type Agent = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  wechat: string;
  role: string;
  active: boolean;
  internalNotes: string;
};

export type DataSource = {
  id: string;
  name: string;
  url: string;
  sourceType: string;
  owner: string;
  refreshCadence: string;
  lastSyncedAt: string;
  status: string;
  notes: string;
};

export type ChangeLogEntry = {
  id: string;
  entityType: 'building' | 'unit' | 'photo' | 'poi' | 'contact' | 'agent' | 'source' | 'other';
  entityId: string;
  changedAt: string;
  changedBy: string;
  changeType: string;
  beforeValue: string;
  afterValue: string;
  notes: string;
};

export type School = {
  id: Exclude<SchoolId, 'all'>;
  name: string;
  shortName: string;
  lat: number;
  lng: number;
};

export type Photo = {
  id: string;
  buildingId: string;
  unitId: string;
  type: string;
  url: string;
  caption: string;
  sourceUrl: string;
  sourceLastChecked: string;
};

export type RentalUnit = {
  id: string;
  buildingId: string;
  unitNumber: string;
  floorPlan: string;
  beds: number;
  baths: string;
  sqft: string;
  floor: string;
  grossRent: number;
  netEffectiveRent: number | null;
  leaseTerm: string;
  availableDate: string;
  concession: string;
  defaultPeople: number;
  maxPeople: number;
  rentStepDifference: number;
  securityDepositAmount: number | null;
  brokerFeeAmount: number | null;
  amenityFeeAmount: number | null;
  utilitiesEstimateMonthly: number | null;
  sourceUrl: string;
  sourceLastChecked: string;
  verificationStatus: string;
  verificationNotes: string;
  lastUpdatedAt: string;
  sourceName: string;
  priceStatus: TrustStatus;
  feeStatus: TrustStatus;
  availabilityStatus: TrustStatus;
  availabilityCheckedAt: string;
  contactId: string;
  updatedBy: string;
  internalNotes: string;
  trust: TrustInfo;
  photos: Photo[];
};

export type NearbyPoi = {
  id: string;
  buildingId: string;
  buildingName: string;
  type: PoiType;
  name: string;
  address: string;
  distanceMeters: number;
  lat: number;
  lng: number;
  rating: number | null;
  userRatingCount: number | null;
  source: string;
  sourceLastChecked: string;
};

export type Building = {
  id: string;
  name: string;
  address: string;
  cityArea: string;
  neighborhood: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  officialWebsite: string;
  availabilityUrl: string;
  description: string;
  buildingType: string;
  unitCount: number;
  leaseTermDefault: string;
  utilitiesPolicy: string;
  amenities: string[];
  securityFeatures: string;
  petPolicy: string;
  parkingInfo: string;
  transitSummary: string;
  nearbySummary: string;
  primaryPhotoUrl: string;
  sourceUrl: string;
  sourceLastChecked: string;
  verificationStatus: string;
  verificationNotes: string;
  lastUpdatedAt: string;
  sourceName: string;
  priceStatus: TrustStatus;
  feeStatus: TrustStatus;
  availabilityStatus: TrustStatus;
  availabilityCheckedAt: string;
  contactId: string;
  updatedBy: string;
  internalNotes: string;
  trust: TrustInfo;
  units: RentalUnit[];
  photos: Photo[];
  pois: NearbyPoi[];
  startingRent: number | null;
  rentRange: string;
};

export type AnalyticsEvent = {
  id: string;
  type: string;
  createdAt: string;
  buildingId?: string;
  unitId?: string;
  schoolId?: SchoolId;
  budget?: string;
  source?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

export type Lead = {
  id: string;
  createdAt: string;
  name: string;
  wechat: string;
  school: string;
  budget: string;
  moveInDate: string;
  interestedUnit: string;
  notes: string;
  buildingId?: string;
  unitId?: string;
  source?: string;
};

export type RentalDataset = {
  generatedAt: string;
  schools: School[];
  buildings: Building[];
  units: RentalUnit[];
  photos: Photo[];
  pois: NearbyPoi[];
  contacts: Contact[];
  agents: Agent[];
  dataSources: DataSource[];
  changeLog: ChangeLogEntry[];
  summary: {
    buildingCount: number;
    unitCount: number;
    poiCount: number;
    lastDataUpdate: string;
    sheetLastSyncedAt?: string;
    dataSourceMode?: 'google_sheet_cache' | 'local_csv';
  };
};
