/**
 * 数据库抽象层统一导出
 */

export {
  getDb,
  getDbSync,
  initDb,
  resetDb,
  getDatabaseProvider,
} from "./client";

export type {
  DatabaseAdapter,
  QueryBuilder,
  QueryResult,
  SingleResult,
  DbError,
  RpcParams,
  OrderOptions,
} from "./types";
