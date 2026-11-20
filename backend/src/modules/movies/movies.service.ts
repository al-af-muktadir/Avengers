import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '../../database/database.service.js';
import { CreateMovieDto } from './dto/create-movie.dto.js';
import { UpdateMovieDto } from './dto/update-movie.dto.js';

export interface MovieRow extends QueryResultRow {
  id: string;
  title: string;
  releaseYear: number;
  runtimeMinutes: number;
  watched: boolean;
  prerequisiteIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class MoviesService {
  constructor(private readonly database: DatabaseService) {}

  private async findMovie(client: PoolClient, id: string): Promise<MovieRow> {
    const result = await client.query<MovieRow>(
      `SELECT
         m.id,
         m.title,
         m.release_year AS "releaseYear",
         m.runtime_minutes AS "runtimeMinutes",
         m.watched,
         m.created_at AS "createdAt",
         m.updated_at AS "updatedAt",
         COALESCE(
           (
             SELECT json_agg(mp.prerequisite_id)
             FROM movie_prerequisites mp
             WHERE mp.movie_id = m.id
           ),
           '[]'::json
         ) AS "prerequisiteIds"
       FROM movies m
       WHERE m.id = $1`,
      [id],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Movie not found');
    }

    return result.rows[0];
  }

  private async validatePrerequisites(
    client: PoolClient,
    movieId: string | null,
    prerequisiteIds: string[],
  ): Promise<void> {
    if (prerequisiteIds.length === 0) return;

    if (movieId && prerequisiteIds.includes(movieId)) {
      throw new ConflictException({
        code: 'CIRCULAR_DEPENDENCY',
        message: 'A movie cannot depend on itself',
      });
    }

    const existing = await client.query<{ id: string }>(
      'SELECT id FROM movies WHERE id = ANY($1::uuid[])',
      [prerequisiteIds],
    );

    if (existing.rows.length !== prerequisiteIds.length) {
      throw new BadRequestException(
        'One or more prerequisite movies do not exist',
      );
    }

    if (!movieId) return;

    // Load the existing graph, excluding the movie's old outgoing edges.
    const edges = await client.query<{
      movie_id: string;
      prerequisite_id: string;
    }>(
      `SELECT movie_id, prerequisite_id
       FROM movie_prerequisites
       WHERE movie_id <> $1`,
      [movieId],
    );

    const graph = new Map<string, string[]>();

    for (const edge of edges.rows) {
      const current = graph.get(edge.movie_id) ?? [];
      current.push(edge.prerequisite_id);
      graph.set(edge.movie_id, current);
    }

    // A cycle exists if any proposed prerequisite already leads back to this movie.
    const reachesMovie = (startId: string): boolean => {
      const visited = new Set<string>();
      const stack = [startId];

      while (stack.length > 0) {
        const current = stack.pop()!;

        if (current === movieId) return true;
        if (visited.has(current)) continue;

        visited.add(current);

        for (const prerequisite of graph.get(current) ?? []) {
          stack.push(prerequisite);
        }
      }

      return false;
    };

    if (prerequisiteIds.some(reachesMovie)) {
      throw new ConflictException({
        code: 'CIRCULAR_DEPENDENCY',
        message: 'This prerequisite selection creates a circular dependency',
      });
    }
  }

  async create(dto: CreateMovieDto): Promise<MovieRow> {
    try {
      return await this.database.transaction(async (client) => {
        const prerequisiteIds = dto.prerequisiteIds ?? [];

        await this.validatePrerequisites(client, null, prerequisiteIds);

        const result = await client.query<{ id: string }>(
          `INSERT INTO movies
             (title, release_year, runtime_minutes, watched)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [
            dto.title.trim(),
            dto.releaseYear,
            dto.runtimeMinutes,
            dto.watched ?? false,
          ],
        );

        const movieId = result.rows[0].id;

        for (const prerequisiteId of prerequisiteIds) {
          await client.query(
            `INSERT INTO movie_prerequisites
               (movie_id, prerequisite_id)
             VALUES ($1, $2)`,
            [movieId, prerequisiteId],
          );
        }

        return this.findMovie(client, movieId);
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('A movie with this title already exists');
      }
      throw error;
    }
  }

  async findAll(): Promise<MovieRow[]> {
    const result = await this.database.query<MovieRow>(
      `SELECT
         m.id,
         m.title,
         m.release_year AS "releaseYear",
         m.runtime_minutes AS "runtimeMinutes",
         m.watched,
         m.created_at AS "createdAt",
         m.updated_at AS "updatedAt",
         COALESCE(
           (
             SELECT json_agg(mp.prerequisite_id)
             FROM movie_prerequisites mp
             WHERE mp.movie_id = m.id
           ),
           '[]'::json
         ) AS "prerequisiteIds"
       FROM movies m
       ORDER BY m.title`,
    );

    return result.rows;
  }

  async update(id: string, dto: UpdateMovieDto): Promise<MovieRow> {
    try {
      return await this.database.transaction(async (client) => {
        await this.findMovie(client, id);

        if (dto.prerequisiteIds !== undefined) {
          await this.validatePrerequisites(client, id, dto.prerequisiteIds);

          await client.query(
            'DELETE FROM movie_prerequisites WHERE movie_id = $1',
            [id],
          );

          for (const prerequisiteId of dto.prerequisiteIds) {
            await client.query(
              `INSERT INTO movie_prerequisites
                 (movie_id, prerequisite_id)
               VALUES ($1, $2)`,
              [id, prerequisiteId],
            );
          }
        }

        const updates: string[] = [];
        const values: unknown[] = [];

        const addUpdate = (column: string, value: unknown) => {
          values.push(value);
          updates.push(`${column} = $${values.length}`);
        };

        if (dto.title !== undefined) {
          addUpdate('title', dto.title.trim());
        }

        if (dto.releaseYear !== undefined) {
          addUpdate('release_year', dto.releaseYear);
        }

        if (dto.runtimeMinutes !== undefined) {
          addUpdate('runtime_minutes', dto.runtimeMinutes);
        }

        if (dto.watched !== undefined) {
          addUpdate('watched', dto.watched);
        }

        if (updates.length > 0) {
          values.push(id);

          await client.query(
            `UPDATE movies
             SET ${updates.join(', ')}, updated_at = NOW()
             WHERE id = $${values.length}`,
            values,
          );
        }

        return this.findMovie(client, id);
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('A movie with this title already exists');
      }
      throw error;
    }
  }

  async getRewatchOrder(targetMovieId: string) {
    // Load all movies.
    const movieResult = await this.database.query<{
      id: string;
      title: string;
      releaseYear: number;
      runtimeMinutes: number;
      watched: boolean;
    }>(
      `SELECT
       id,
       title,
       release_year AS "releaseYear",
       runtime_minutes AS "runtimeMinutes",
       watched
     FROM movies`,
    );

    // Load all prerequisite relationships.
    const edgeResult = await this.database.query<{
      movie_id: string;
      prerequisite_id: string;
    }>(
      `SELECT movie_id, prerequisite_id
     FROM movie_prerequisites`,
    );

    const movies = new Map(
      movieResult.rows.map((movie) => [
        movie.id,
        { ...movie, prerequisites: [] as string[] },
      ]),
    );

    // Build the dependency graph.
    for (const edge of edgeResult.rows) {
      movies.get(edge.movie_id)?.prerequisites.push(edge.prerequisite_id);
    }

    if (!movies.has(targetMovieId)) {
      throw new NotFoundException('Movie not found');
    }

    // 0 = unvisited, 1 = currently visiting, 2 = completed.
    const states = new Map<string, number>();
    const orderedIds: string[] = [];

    const visit = (movieId: string): void => {
      const state = states.get(movieId) ?? 0;

      if (state === 1) {
        throw new ConflictException({
          code: 'CIRCULAR_DEPENDENCY',
          message: 'Circular dependency detected',
        });
      }

      if (state === 2) return;

      states.set(movieId, 1);

      const movie = movies.get(movieId)!;

      for (const prerequisiteId of movie.prerequisites) {
        visit(prerequisiteId);
      }

      states.set(movieId, 2);
      orderedIds.push(movieId);
    };

    // Start traversal from the target.
    visit(targetMovieId);

    // Exclude the target itself.
    const rewatchOrder = orderedIds
      .filter((id) => id !== targetMovieId)
      .map((id) => movies.get(id)!);

    const watchedCount = rewatchOrder.filter((movie) => movie.watched).length;

    const unwatchedMovies = rewatchOrder.filter((movie) => !movie.watched);

    const remainingRuntimeMinutes = unwatchedMovies.reduce(
      (total, movie) => total + movie.runtimeMinutes,
      0,
    );

    return {
      targetMovie: movies.get(targetMovieId)!.title,
      rewatchOrder,
      summary: {
        totalMovies: rewatchOrder.length,
        watchedCount,
        unwatchedCount: unwatchedMovies.length,
        remainingRuntimeMinutes,
      },
    };
  }
}
