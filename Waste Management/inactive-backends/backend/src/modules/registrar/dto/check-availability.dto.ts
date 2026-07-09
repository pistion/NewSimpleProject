import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, Matches, MaxLength } from 'class-validator';

export class CheckAvailabilityDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(253, { each: true })
  @Matches(/^(?!-)(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/, {
    each: true,
    message: 'Each domain must be a valid domain name'
  })
  domains!: string[];
}
