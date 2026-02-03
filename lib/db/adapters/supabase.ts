/**
 * Supabase 适配器
 *
 * 包装现有的 createAdminClient，提供与 DatabaseAdapter 兼容的接口
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  DatabaseAdapter,
  QueryBuilder,
  QueryResult,
  SingleResult,
  DbError,
  RpcParams,
} from "../types";

type SupabaseClient = ReturnType<typeof createAdminClient>;

function toDbError(
  error: { message: string; code?: string } | null
): DbError | null {
  if (!error) return null;
  return { message: error.message, code: error.code };
}

/**
 * 将 Supabase 查询构建器包装为 DatabaseAdapter 兼容的接口
 */
class SupabaseQueryBuilder<T> implements QueryBuilder<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _query: any;
  private _isSingle = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(query: any) {
    this._query = query;
  }

  select(columns?: string): QueryBuilder<T> {
    this._query = this._query.select(columns || "*");
    return this;
  }

  insert(data: Partial<T> | Partial<T>[]): QueryBuilder<T> {
    this._query = this._query.insert(data);
    return this;
  }

  update(data: Partial<T>): QueryBuilder<T> {
    this._query = this._query.update(data);
    return this;
  }

  delete(): QueryBuilder<T> {
    this._query = this._query.delete();
    return this;
  }

  eq(column: string, value: unknown): QueryBuilder<T> {
    this._query = this._query.eq(column, value);
    return this;
  }

  neq(column: string, value: unknown): QueryBuilder<T> {
    this._query = this._query.neq(column, value);
    return this;
  }

  lt(column: string, value: unknown): QueryBuilder<T> {
    this._query = this._query.lt(column, value);
    return this;
  }

  lte(column: string, value: unknown): QueryBuilder<T> {
    this._query = this._query.lte(column, value);
    return this;
  }

  gt(column: string, value: unknown): QueryBuilder<T> {
    this._query = this._query.gt(column, value);
    return this;
  }

  gte(column: string, value: unknown): QueryBuilder<T> {
    this._query = this._query.gte(column, value);
    return this;
  }

  in(column: string, values: unknown[]): QueryBuilder<T> {
    this._query = this._query.in(column, values);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T> {
    this._query = this._query.order(column, options);
    return this;
  }

  limit(count: number): QueryBuilder<T> {
    this._query = this._query.limit(count);
    return this;
  }

  async single(): Promise<SingleResult<T>> {
    this._isSingle = true;
    const result = await this._query.single();
    return {
      data: result.data as T | null,
      error: toDbError(result.error),
    };
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this._query.then(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result: { data: any; error: any }) => {
        const transformed: QueryResult<T> = {
          data: result.data as T[] | null,
          error: toDbError(result.error),
        };
        return onfulfilled ? onfulfilled(transformed) : (transformed as unknown as TResult1);
      },
      onrejected
    );
  }
}

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    _client = createAdminClient();
  }
  return _client;
}

export function createSupabaseAdapter(): DatabaseAdapter {
  return {
    from<T = Record<string, unknown>>(table: string): QueryBuilder<T> {
      const client = getClient();
      return new SupabaseQueryBuilder<T>(client.from(table));
    },

    async rpc<T = unknown>(
      name: string,
      params?: RpcParams
    ): Promise<QueryResult<T>> {
      const client = getClient();
      const result = await client.rpc(name, params);
      return {
        data: result.data as T[] | null,
        error: toDbError(result.error),
      };
    },
  };
}
