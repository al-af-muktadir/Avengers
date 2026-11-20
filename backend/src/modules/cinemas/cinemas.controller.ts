import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';

import { CinemasService } from './cinemas.service.js';
import { CreateCinemaDto } from './dto/create-cinema.dto.js';

@Controller('cinemas')
export class CinemasController {
  constructor(private readonly cinemasService: CinemasService) {}

  @Post()
  create(@Body() dto: CreateCinemaDto) {
    return this.cinemasService.create(dto);
  }

  @Get()
  findAll() {
    return this.cinemasService.findAll();
  }

  @Get(':id/booking')
  getBookingQuote(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('groupSize', ParseIntPipe) groupSize: number,
  ) {
    return this.cinemasService.getBookingQuote(id, groupSize);
  }
}
