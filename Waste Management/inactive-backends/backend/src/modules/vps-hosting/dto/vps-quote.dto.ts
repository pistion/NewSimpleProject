import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class VpsQuoteDto {
  @IsString()
  @IsNotEmpty()
  region!: string;

  @IsString()
  @IsNotEmpty()
  plan!: string;

  @IsInt()
  osId!: number;
}
