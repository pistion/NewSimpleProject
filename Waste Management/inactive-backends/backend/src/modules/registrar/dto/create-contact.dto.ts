import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  lastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  company?: string;

  @IsString()
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'email must be a valid address' })
  email!: string;

  /**
   * Phone number in international format — e.g. "+1.5550001234".
   * Spaceship requires the country code prefix with a period separator.
   */
  @IsString()
  @Matches(/^\+\d{1,3}\.\d{4,14}$/, {
    message: 'phone must be in international format, e.g. "+1.5550001234"',
  })
  phone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  address1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  address2?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  city!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(16)
  postalCode!: string;

  /**
   * ISO 3166-1 alpha-2 country code, e.g. "US", "AU", "PG".
   */
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: 'country must be an ISO 3166-1 alpha-2 code, e.g. "US"' })
  country!: string;
}
