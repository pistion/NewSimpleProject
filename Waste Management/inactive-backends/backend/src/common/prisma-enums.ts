export const UserStatus = {
  active: 'active',
  locked: 'locked',
  disabled: 'disabled',
  pending: 'pending',
} as const;

export const ProjectStatus = {
  active: 'active',
  paused: 'paused',
  archived: 'archived',
} as const;

export const ProjectEnvironment = {
  production: 'production',
  preview: 'preview',
  development: 'development',
} as const;

export const DeploymentEnvironment = {
  production: 'production',
  preview: 'preview',
} as const;

export const DeploymentStatus = {
  queued: 'queued',
  building: 'building',
  uploading: 'uploading',
  deployed: 'deployed',
  failed: 'failed',
  cancelled: 'cancelled',
  rolled_back: 'rolled_back',
} as const;

export const DeploymentSource = {
  git: 'git',
  builder: 'builder',
  manual: 'manual',
} as const;

export const DnsRecordType = {
  A: 'A',
  AAAA: 'AAAA',
  CNAME: 'CNAME',
  TXT: 'TXT',
  MX: 'MX',
  NS: 'NS',
  SRV: 'SRV',
  CAA: 'CAA',
} as const;

export const DnsRecordStatus = {
  pending: 'pending',
  active: 'active',
  failed: 'failed',
} as const;

export const DomainStatus = {
  pending_verification: 'pending_verification',
  verified: 'verified',
  active: 'active',
  misconfigured: 'misconfigured',
  disabled: 'disabled',
} as const;

export const SslCertificateStatus = {
  pending: 'pending',
  issued: 'issued',
  active: 'active',
  renewing: 'renewing',
  expired: 'expired',
  failed: 'failed',
} as const;

export const WebhookDeliveryStatus = {
  pending: 'pending',
  delivered: 'delivered',
  failed: 'failed',
  dead: 'dead',
} as const;

export type ValueOf<T> = T[keyof T];

export type UserStatus = ValueOf<typeof UserStatus>;
export type ProjectStatus = ValueOf<typeof ProjectStatus>;
export type ProjectEnvironment = ValueOf<typeof ProjectEnvironment>;
export type DeploymentEnvironment = ValueOf<typeof DeploymentEnvironment>;
export type DeploymentStatus = ValueOf<typeof DeploymentStatus>;
export type DeploymentSource = ValueOf<typeof DeploymentSource>;
export type DnsRecordType = ValueOf<typeof DnsRecordType>;
export type DnsRecordStatus = ValueOf<typeof DnsRecordStatus>;
export type DomainStatus = ValueOf<typeof DomainStatus>;
export type SslCertificateStatus = ValueOf<typeof SslCertificateStatus>;
export type WebhookDeliveryStatus = ValueOf<typeof WebhookDeliveryStatus>;
