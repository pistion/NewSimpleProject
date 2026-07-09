import { IsNotEmpty, IsString } from 'class-validator';

export class CaptureVpsPayPalDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;
}
