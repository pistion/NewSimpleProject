import { IsUUID } from 'class-validator';

export class DomainParamsDto {
  @IsUUID()
  domainId!: string;
}
