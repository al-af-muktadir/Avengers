import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsUUID,
  ArrayUnique,
} from 'class-validator';

export class CreateMovieDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @IsInt()
  @Min(1888)
  @Max(2100)
  releaseYear!: number;

  @IsInt()
  @Min(1)
  @Max(300)
  runtimeMinutes!: number;

  @IsOptional()
  @IsBoolean()
  watched?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  prerequisiteIds?: string[];
}
