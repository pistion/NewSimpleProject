import { IsDateString, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export class RenewDomainDto {
  @IsString()
  @MaxLength(253)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  years!: number;

  @IsDateString()
  currentExpirationDate!: string;
}
