import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from './database/database.module.js';
import { MoviesModule } from './modules/movies/movies.module.js';
import { CinemasModule } from './modules/cinemas/cinemas.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    MoviesModule,
    CinemasModule,
  ],
})
export class AppModule {}
