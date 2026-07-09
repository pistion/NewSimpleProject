// ── Spaceship API type definitions ────────────────────────────────────────────

export interface SpaceshipDomain {
  name: string;
  unicodeName: string;
  isPremium: boolean;
  autoRenew: boolean;
  registrationDate: string;
  expirationDate: string;
  lifecycleStatus: string;
  verificationStatus: string;
  eppStatuses: string[];
  suspensions: Array<{ reasonCode: string }>;
  privacyProtection: { contactForm: boolean; level: string };
  nameservers: { provider: string; hosts: string[] };
  contacts: {
    registrant: string;
    admin?: string;
    tech?: string;
    billing?: string;
    attributes?: string[];
  };
}

export interface SpaceshipDomainList {
  items: SpaceshipDomain[];
  total: number;
}

export interface SpaceshipAvailabilityItem {
  domain: string;
  result: 'available' | 'unavailable' | string;
  premiumPricing?: Array<{ operation: string; price: number; currency: string }>;
}

export interface SpaceshipAvailabilityResult {
  domains: SpaceshipAvailabilityItem[];
}

export interface SpaceshipAsyncOp {
  operationId: string;
  status: 'pending' | 'success' | 'failed';
}

export interface SpaceshipOperation {
  id: string;
  status: 'pending' | 'success' | 'failed';
  type: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

// ── DNS record types ───────────────────────────────────────────────────────────

export interface SpaceshipDnsRecordBase {
  type: string;
  name: string;
  ttl: number;
  group?: { type: string };
}

export interface SpaceshipDnsA extends SpaceshipDnsRecordBase {
  type: 'A';
  address: string;
}
export interface SpaceshipDnsAAAA extends SpaceshipDnsRecordBase {
  type: 'AAAA';
  address: string;
}
export interface SpaceshipDnsCNAME extends SpaceshipDnsRecordBase {
  type: 'CNAME';
  target: string;
}
export interface SpaceshipDnsALIAS extends SpaceshipDnsRecordBase {
  type: 'ALIAS';
  target: string;
}
export interface SpaceshipDnsMX extends SpaceshipDnsRecordBase {
  type: 'MX';
  exchange: string;
  preference: number;
}
export interface SpaceshipDnsNS extends SpaceshipDnsRecordBase {
  type: 'NS';
  nameserver: string;
}
export interface SpaceshipDnsTXT extends SpaceshipDnsRecordBase {
  type: 'TXT';
  data: string;
}
export interface SpaceshipDnsSRV extends SpaceshipDnsRecordBase {
  type: 'SRV';
  priority: number;
  weight: number;
  port: number;
  target: string;
}
export interface SpaceshipDnsCAA extends SpaceshipDnsRecordBase {
  type: 'CAA';
  flag: number;
  tag: string;
  value: string;
}

export type SpaceshipDnsRecord =
  | SpaceshipDnsA
  | SpaceshipDnsAAAA
  | SpaceshipDnsCNAME
  | SpaceshipDnsALIAS
  | SpaceshipDnsMX
  | SpaceshipDnsNS
  | SpaceshipDnsTXT
  | SpaceshipDnsSRV
  | SpaceshipDnsCAA
  | SpaceshipDnsRecordBase;

export interface SpaceshipDnsRecordList {
  items: SpaceshipDnsRecord[];
  total: number;
}

export interface SpaceshipRegisterOptions {
  autoRenew: boolean;
  years: number;
  privacyProtection: { level: 'high' | 'public'; userConsent: boolean };
  contacts: { registrant: string; admin?: string; tech?: string; billing?: string };
}

// ── Contact types ─────────────────────────────────────────────────────────────

export interface SpaceshipContact {
  id: string;
  firstName: string;
  lastName: string;
  company?: string;
  email: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  postalCode: string;
  country: string; // ISO 3166-1 alpha-2
  createdAt?: string;
  updatedAt?: string;
}

export interface SpaceshipContactList {
  items: SpaceshipContact[];
  total: number;
}

export interface SpaceshipCreateContactOptions {
  firstName: string;
  lastName: string;
  company?: string;
  email: string;
  phone: string;      // e.g. "+1.5550001234"
  address1: string;
  address2?: string;
  city: string;
  postalCode: string;
  country: string;    // ISO 3166-1 alpha-2, e.g. "US"
}
