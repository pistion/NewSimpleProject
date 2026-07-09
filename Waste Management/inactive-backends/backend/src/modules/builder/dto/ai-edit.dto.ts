import { IsString, MaxLength, MinLength } from 'class-validator';

export class AiEditDto {
  @IsString()
  @MinLength(1)
  html: string;

  @IsString()
  @MinLength(4)
  @MaxLength(2000)
  prompt: string;

  /** Optional page path for context (e.g. '/' or '/shop') */
  @IsString()
  path?: string;
}
