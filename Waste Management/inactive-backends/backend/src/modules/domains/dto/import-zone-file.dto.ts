import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ImportZoneFileDto {
  @IsString()
  @MaxLength(500_000)
  content!: string;

  /** When true, all existing records for the domain are deleted before import. */
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;
}
