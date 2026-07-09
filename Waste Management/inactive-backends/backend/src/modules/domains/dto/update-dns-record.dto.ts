import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateDnsRecordDto {
  @IsOptional()
  @IsIn(['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'CAA'])
  type?: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS' | 'SRV' | 'CAA';

  @IsOptional()
  @IsString()
  @MaxLength(253)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  value?: string;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86400)
  ttl?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(65535)
  priority?: number | null;

  @IsOptional()
  @IsBoolean()
  proxied?: boolean;
}
