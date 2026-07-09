import { IsUUID } from 'class-validator';

export class DnsRecordParamsDto {
  @IsUUID()
  domainId!: string;

  @IsUUID()
  recordId!: string;
}
