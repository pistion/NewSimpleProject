import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class RegisterDomainDto {
  @IsString()
  @MaxLength(253)
  @Matches(/^(?!-)(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/, {
    message: 'hostname must be a valid domain name'
  })
  hostname!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  years?: number;

  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;

  @IsOptional()
  @IsBoolean()
  privacyProtection?: boolean;

  /** Spaceship contact ID for the registrant. Falls back to SPACESHIP_DEFAULT_CONTACT_ID. */
  @IsOptional()
  @IsString()
  contactId?: string;

  /** Link to an existing Glondia project ID after registration. */
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
