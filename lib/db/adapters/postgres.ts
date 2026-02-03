/**
 * postgres.js 适配器
 *
 * 使用 postgres.js 连接标准 PostgreSQL 数据库
 */

import postgres from "postgres";
import type {
  DatabaseAdapter,
  QueryBuilder,
  QueryResult,
  SingleResult,
  DbError,
  RpcParams,
} from "../types";

const DB_SCHEMA =
  process.env.DATABASE_SCHEMA ||
  (process.env.NODE_ENV === "development" ? "dev" : "public");

let _sql: postgres.Sql | null = null;

function getSql(): postgres.Sql {
  if (!_sql) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("缺少 DATABASE_URL 环境变量");
    }
    _sql = postgres(databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return _sql;
}

function qualified(table: string): string {
  return DB_SCHEMA === "public" ? table : `${DB_SCHEMA}.${table}`;
}

function toDbError(err: unknown): DbError {
  if (err instanceof Error) {
    const pgErr = err as Error & { code?: string };
    return { message: pgErr.message, code: pgErr.code };
  }
  return { message: String(err) };
}

/**
 * 查询构建器实现 - 构建 SQL 并用 postgres.js 执行
 */
class PgQueryBuilder<T> implements QueryBuilder<T> {
  private _table: string;
  private _operation: "select" | "insert" | "update" | "delete" = "select";
  private _selectColumns = "*";
  private _insertData: Partial<T> | Partial<T>[] | null = null;
  private _updateData: Partial<T> | null = null;
  private _wheres: Array<{ column: string; op: string; value: unknown }> = [];
  private _inFilters: Array<{ column: string; values: unknown[] }> = [];
  private _orders: Array<{ column: string; ascending: boolean }> = [];
  private _limitCount: number | null = null;
  private _returnSelect = false;

  constructor(table: string) {
    this._table = qualified(table);
  }

  select(columns?: string): QueryBuilder<T> {
    this._selectColumns = columns || "*";
    if (this._operation === "update" || this._operation === "delete") {
      this._returnSelect = true;
    } else {
      this._operation = "select";
    }
    return this;
  }

  insert(data: Partial<T> | Partial<T>[]): QueryBuilder<T> {
    this._operation = "insert";
    this._insertData = data;
    return this;
  }

  update(data: Partial<T>): QueryBuilder<T> {
    this._operation = "update";
    this._updateData = data;
    return this;
  }

  delete(): QueryBuilder<T> {
    this._operation = "delete";
    return this;
  }

  eq(column: string, value: unknown): QueryBuilder<T> {
    this._wheres.push({ column, op: "=", value });
    return this;
  }

  neq(column: string, value: unknown): QueryBuilder<T> {
    this._wheres.push({ column, op: "!=", value });
    return this;
  }

  lt(column: string, value: unknown): QueryBuilder<T> {
    this._wheres.push({ column, op: "<", value });
    return this;
  }

  lte(column: string, value: unknown): QueryBuilder<T> {
    this._wheres.push({ column, op: "<=", value });
    return this;
  }

  gt(column: string, value: unknown): QueryBuilder<T> {
    this._wheres.push({ column, op: ">", value });
    return this;
  }

  gte(column: string, value: unknown): QueryBuilder<T> {
    this._wheres.push({ column, op: ">=", value });
    return this;
  }

  in(column: string, values: unknown[]): QueryBuilder<T> {
    this._inFilters.push({ column, values });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T> {
    this._orders.push({
      column,
      ascending: options?.ascending ?? true,
    });
    return this;
  }

  limit(count: number): QueryBuilder<T> {
    this._limitCount = count;
    return this;
  }

  async single(): Promise<SingleResult<T>> {
    const result = await this.execute();
    if (result.error) {
      return { data: null, error: result.error };
    }
    if (!result.data || result.data.length === 0) {
      return {
        data: null,
        error: { message: "未找到记录", code: "PGRST116" },
      };
    }
    return { data: result.data[0], error: null };
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<QueryResult<T>> {
    const sql = getSql();

    try {
      switch (this._operation) {
        case "select":
          return await this.executeSelect(sql);
        case "insert":
          return await this.executeInsert(sql);
        case "update":
          return await this.executeUpdate(sql);
        case "delete":
          return await this.executeDelete(sql);
        default:
          return { data: null, error: { message: `未知操作: ${this._operation}` } };
      }
    } catch (err) {
      return { data: null, error: toDbError(err) };
    }
  }

  private buildWhereClause(): string {
    const conditions: string[] = [];

    for (const w of this._wheres) {
      conditions.push(`${quoteIdent(w.column)} ${w.op} ${quoteLiteral(w.value)}`);
    }

    for (const f of this._inFilters) {
      if (f.values.length === 0) {
        conditions.push("false");
      } else {
        const vals = f.values.map(quoteLiteral).join(", ");
        conditions.push(`${quoteIdent(f.column)} IN (${vals})`);
      }
    }

    return conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  }

  private buildOrderClause(): string {
    if (this._orders.length === 0) return "";
    const parts = this._orders.map(
      (o) => `${quoteIdent(o.column)} ${o.ascending ? "ASC" : "DESC"}`
    );
    return ` ORDER BY ${parts.join(", ")}`;
  }

  private buildLimitClause(): string {
    return this._limitCount !== null ? ` LIMIT ${this._limitCount}` : "";
  }

  private async executeSelect(sql: postgres.Sql): Promise<QueryResult<T>> {
    const query = `SELECT ${this._selectColumns} FROM ${this._table}${this.buildWhereClause()}${this.buildOrderClause()}${this.buildLimitClause()}`;
    const rows = await sql.unsafe(query);
    return { data: rows as unknown as T[], error: null };
  }

  private async executeInsert(sql: postgres.Sql): Promise<QueryResult<T>> {
    const dataArray = Array.isArray(this._insertData)
      ? this._insertData
      : [this._insertData];

    if (dataArray.length === 0 || !dataArray[0]) {
      return { data: [], error: null };
    }

    const columns = Object.keys(dataArray[0] as Record<string, unknown>);
    const colNames = columns.map(quoteIdent).join(", ");
    const valueSets = dataArray.map((row) => {
      const vals = columns.map((col) =>
        quoteLiteral((row as Record<string, unknown>)[col])
      );
      return `(${vals.join(", ")})`;
    });

    const returning = this._returnSelect
      ? ` RETURNING ${this._selectColumns}`
      : "";

    const query = `INSERT INTO ${this._table} (${colNames}) VALUES ${valueSets.join(", ")}${returning}`;
    const rows = await sql.unsafe(query);
    return { data: rows as unknown as T[], error: null };
  }

  private async executeUpdate(sql: postgres.Sql): Promise<QueryResult<T>> {
    if (!this._updateData) {
      return { data: null, error: { message: "更新操作缺少数据" } };
    }

    const sets = Object.entries(this._updateData as Record<string, unknown>)
      .map(([col, val]) => `${quoteIdent(col)} = ${quoteLiteral(val)}`)
      .join(", ");

    const returning = this._returnSelect
      ? ` RETURNING ${this._selectColumns}`
      : "";

    const query = `UPDATE ${this._table} SET ${sets}${this.buildWhereClause()}${returning}`;
    const rows = await sql.unsafe(query);
    return { data: rows as unknown as T[], error: null };
  }

  private async executeDelete(sql: postgres.Sql): Promise<QueryResult<T>> {
    const returning = this._returnSelect
      ? ` RETURNING ${this._selectColumns}`
      : "";

    const query = `DELETE FROM ${this._table}${this.buildWhereClause()}${returning}`;
    const rows = await sql.unsafe(query);
    return { data: rows as unknown as T[], error: null };
  }
}

function quoteIdent(name: string): string {
  // Simple identifier quoting - prevent SQL injection
  return `"${name.replace(/"/g, '""')}"`;
}

// UUID 格式检测
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function quoteLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  // 数组 -> PostgreSQL ARRAY 语法
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "NULL"; // 空数组当作 NULL 处理
    }
    const items = value.map((item) => {
      if (typeof item === "string") {
        return `'${item.replace(/'/g, "''")}'`;
      }
      return quoteLiteral(item);
    });
    const arrayLiteral = `ARRAY[${items.join(", ")}]`;
    // 如果所有元素都是 UUID，添加类型转换
    if (value.every(isUuid)) {
      return `${arrayLiteral}::uuid[]`;
    }
    return arrayLiteral;
  }
  if (typeof value === "object") {
    // JSON objects
    const json = JSON.stringify(value);
    return `'${json.replace(/'/g, "''")}'::jsonb`;
  }
  // String
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function createPostgresAdapter(): DatabaseAdapter {
  return {
    from<T = Record<string, unknown>>(table: string): QueryBuilder<T> {
      return new PgQueryBuilder<T>(table);
    },

    async rpc<T = unknown>(
      name: string,
      params?: RpcParams
    ): Promise<QueryResult<T>> {
      const sql = getSql();
      try {
        const schema = DB_SCHEMA;
        const funcName =
          schema === "public" ? name : `${schema}.${name}`;

        // Build function call with named parameters
        const paramEntries = params ? Object.entries(params) : [];
        let funcCall: string;
        if (paramEntries.length === 0) {
          funcCall = `SELECT * FROM ${funcName}()`;
        } else {
          const argsList = paramEntries
            .map(([key, val]) => `${key} := ${quoteLiteral(val)}`)
            .join(", ");
          funcCall = `SELECT * FROM ${funcName}(${argsList})`;
        }

        const rows = await sql.unsafe(funcCall);
        return { data: rows as unknown as T[], error: null };
      } catch (err) {
        return { data: null, error: toDbError(err) };
      }
    },

    async query<T = unknown>(
      sqlQuery: string,
      _params?: unknown[]
    ): Promise<QueryResult<T>> {
      const sql = getSql();
      try {
        const rows = await sql.unsafe(sqlQuery);
        return { data: rows as unknown as T[], error: null };
      } catch (err) {
        return { data: null, error: toDbError(err) };
      }
    },
  };
}
