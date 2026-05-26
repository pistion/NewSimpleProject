import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateVpsDto {
  @IsString()
  @IsNotEmpty()
  region!: string;

  @IsString()
  @IsNotEmpty()
  plan!: string;

  @IsInt()
  osId!: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(64)
  label!: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  hostname?: string;

  /** Pre-existing Vultr SSH key UUID */
  @IsString()
  @IsOptional()
  sshKeyId?: string;

  /** Paste a new public key — backend registers it in Vultr and uses the returned ID */
  @IsString()
  @IsOptional()
  sshPublicKey?: string;

  /** Display name for the new SSH key (defaults to label if omitted) */
  @IsString()
  @IsOptional()
  @MaxLength(64)
  sshKeyName?: string;

  /** Cloud-init / user data (plain text — backend base64-encodes before sending) */
  @IsString()
  @IsOptional()
  userData?: string;

  /** Enable IPv6 on the instance */
  @IsBoolean()
  @IsOptional()
  enableIpv6?: boolean;

  /** Enable automatic daily backups */
  @IsBoolean()
  @IsOptional()
  backups?: boolean;

  /** Enable DDoS protection (additional charge applies) */
  @IsBoolean()
  @IsOptional()
  ddosProtection?: boolean;
}
