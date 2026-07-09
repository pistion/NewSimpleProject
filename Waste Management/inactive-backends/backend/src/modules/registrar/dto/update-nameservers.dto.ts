import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateNameserversDto {
  @IsIn(['basic', 'custom'])
  provider!: 'basic' | 'custom';

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(12)
  @IsString({ each: true })
  hosts?: string[];
}
