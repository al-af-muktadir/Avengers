import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import { CreateCinemaDto } from './dto/create-cinema.dto.js';

export interface CinemaRow {
  id: string;
  name: string;
  bundleSizes: number[];
}

@Injectable()
export class CinemasService {
  constructor(private readonly database: DatabaseService) {}

  async create(dto: CreateCinemaDto): Promise<CinemaRow> {
    try {
      return await this.database.transaction(async (client) => {
        const result = await client.query<{ id: string }>(
          `INSERT INTO cinemas (name)
           VALUES ($1)
           RETURNING id`,
          [dto.name.trim()],
        );

        const cinemaId = result.rows[0].id;

        await client.query(
          `INSERT INTO cinema_bundle_sizes (cinema_id, bundle_size)
           SELECT $1, unnest($2::integer[])`,
          [cinemaId, dto.bundleSizes],
        );

        return {
          id: cinemaId,
          name: dto.name.trim(),
          bundleSizes: [...dto.bundleSizes].sort((a, b) => a - b),
        };
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Cinema name already exists');
      }
      throw error;
    }
  }

  async findAll(): Promise<CinemaRow[]> {
    const result = await this.database.query<CinemaRow>(
      `SELECT
         c.id,
         c.name,
         COALESCE(
           array_agg(cbs.bundle_size ORDER BY cbs.bundle_size)
             FILTER (WHERE cbs.bundle_size IS NOT NULL),
           ARRAY[]::integer[]
         ) AS "bundleSizes"
       FROM cinemas c
       LEFT JOIN cinema_bundle_sizes cbs
         ON cbs.cinema_id = c.id
       GROUP BY c.id, c.name
       ORDER BY c.name`,
    );

    return result.rows;
  }

  async getBookingQuote(cinemaId: string, groupSize: number) {
    if (!Number.isInteger(groupSize) || groupSize < 1 || groupSize > 10000) {
      throw new BadRequestException('Group size must be between 1 and 10000');
    }

    const result = await this.database.query<{
      bundle_size: number;
    }>(
      `SELECT bundle_size
       FROM cinema_bundle_sizes
       WHERE cinema_id = $1
       ORDER BY bundle_size`,
      [cinemaId],
    );

    if (result.rows.length === 0) {
      const cinema = await this.database.query(
        'SELECT id FROM cinemas WHERE id = $1',
        [cinemaId],
      );

      if (cinema.rows.length === 0) {
        throw new NotFoundException('Cinema not found');
      }
    }

    const sizes = result.rows.map((row) => row.bundle_size);

    // dp[amount] stores the minimum number of bundles needed.
    const dp = new Array(groupSize + 1).fill(Infinity);

    // Stores the bundle size selected for each amount.
    const previousBundle = new Array(groupSize + 1).fill(0);

    dp[0] = 0;

    // Dynamic programming: minimum bundle count.
    for (let amount = 1; amount <= groupSize; amount++) {
      for (const size of sizes) {
        if (size <= amount && dp[amount - size] + 1 < dp[amount]) {
          dp[amount] = dp[amount - size] + 1;
          previousBundle[amount] = size;
        }
      }
    }

    if (!Number.isFinite(dp[groupSize])) {
      return {
        possible: false,
        groupSize,
        message: 'No exact bundle combination is possible',
      };
    }

    // Reconstruct the selected bundles.
    const bundleCounts: Record<number, number> = {};
    let remaining = groupSize;

    while (remaining > 0) {
      const size = previousBundle[remaining];

      bundleCounts[size] = (bundleCounts[size] ?? 0) + 1;
      remaining -= size;
    }

    return {
      possible: true,
      groupSize,
      totalBundles: dp[groupSize],
      bundles: Object.entries(bundleCounts)
        .map(([size, count]) => ({
          bundleSize: Number(size),
          count,
        }))
        .sort((a, b) => b.bundleSize - a.bundleSize),
    };
  }
}
