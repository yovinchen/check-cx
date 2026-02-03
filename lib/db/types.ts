/**
 * 数据库抽象层类型定义
 */

/**
 * 数据库查询结果
 */
export interface QueryResult<T> {
  data: T[] | null;
  error: DbError | null;
}

/**
 * 数据库单条结果
 */
export interface SingleResult<T> {
  data: T | null;
  error: DbError | null;
}

/**
 * 数据库错误
 */
export interface DbError {
  message: string;
  code?: string;
}

/**
 * 排序选项
 */
export interface OrderOptions {
  column: string;
  ascending?: boolean;
}

/**
 * 查询构建器 - 模拟 Supabase 风格的链式 API
 */
export interface QueryBuilder<T> {
  select(columns?: string): QueryBuilder<T>;
  insert(data: Partial<T> | Partial<T>[]): QueryBuilder<T>;
  update(data: Partial<T>): QueryBuilder<T>;
  delete(): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  neq(column: string, value: unknown): QueryBuilder<T>;
  lt(column: string, value: unknown): QueryBuilder<T>;
  lte(column: string, value: unknown): QueryBuilder<T>;
  gt(column: string, value: unknown): QueryBuilder<T>;
  gte(column: string, value: unknown): QueryBuilder<T>;
  in(column: string, values: unknown[]): QueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  single(): Promise<SingleResult<T>>;
  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2>;
}

/**
 * RPC 调用参数
 */
export type RpcParams = Record<string, unknown>;

/**
 * 数据库适配器接口
 */
export interface DatabaseAdapter {
  /**
   * 从表创建查询构建器
   */
  from<T = Record<string, unknown>>(table: string): QueryBuilder<T>;

  /**
   * 调用数据库 RPC/函数
   */
  rpc<T = unknown>(name: string, params?: RpcParams): Promise<QueryResult<T>>;

  /**
   * 执行原始 SQL 查询（仅 postgres.js 适配器支持）
   */
  query?<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}
