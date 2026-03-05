/**
 * 数据库配置加载模块
 */

import "server-only";
import { getDb } from "@/lib/db";
import { getPollingIntervalMs } from "../core/polling-config";
import type { CheckConfigRow, ProviderConfig, ProviderType } from "../types";
import type { CheckRequestTemplateRow } from "../types/database";
import { logError } from "../utils";

interface ConfigCache {
  data: ProviderConfig[];
  lastFetchedAt: number;
}

interface ConfigCacheMetrics {
  hits: number;
  misses: number;
}


interface DbQueryError {
  message?: string;
  code?: string;
}

type JsonRecord = Record<string, unknown>;
type TemplateProjection = Pick<
  CheckRequestTemplateRow,
  "id" | "type" | "request_header" | "metadata"
>;
type ConfigProjection = Pick<
  CheckConfigRow,
  "id" | "name" | "type" | "model" | "endpoint" | "api_key" | "is_maintenance" | "template_id" | "request_header" | "metadata" | "group_name"
>;

const cache: ConfigCache = {
  data: [],
  lastFetchedAt: 0,
};

const metrics: ConfigCacheMetrics = {
  hits: 0,
  misses: 0,
};

// null: 未探测，true: 支持 template_id，false: 旧库不支持
let supportsTemplateId: boolean | null = null;

export function getConfigCacheMetrics(): ConfigCacheMetrics {
  return { ...metrics };
}

export function resetConfigCacheMetrics(): void {
  metrics.hits = 0;
  metrics.misses = 0;
}

function isMissingTemplateIdColumn(error: DbQueryError | null): boolean {
  if (!error) return false;
  return (
    error.code === "42703" &&
    typeof error.message === "string" &&
    error.message.includes("template_id")
  );
}

function normalizeJsonRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function mergeTemplateAndConfig(templateValue: unknown, configValue: unknown): JsonRecord | null {
  const templateRecord = normalizeJsonRecord(templateValue);
  const configRecord = normalizeJsonRecord(configValue);

  if (!templateRecord && !configRecord) {
    return null;
  }

  return {
    ...(templateRecord ?? {}),
    ...(configRecord ?? {}),
  };
}

function getTemplate(
  row: ConfigProjection,
  templateMap: Map<string, TemplateProjection>
): TemplateProjection | null {
  if (!row.template_id) {
    return null;
  }

  const template = templateMap.get(row.template_id);
  if (!template || template.type !== row.type) {
    return null;
  }
  return template;
}

/**
 * 从数据库加载启用的 Provider 配置
 * @returns Provider 配置列表
 */
export async function loadProviderConfigsFromDB(options?: {
  forceRefresh?: boolean;
}): Promise<ProviderConfig[]> {
  try {
    const now = Date.now();
    const ttl = getPollingIntervalMs();
    if (!options?.forceRefresh && now - cache.lastFetchedAt < ttl) {
      metrics.hits += 1;
      return cache.data;
    }
    metrics.misses += 1;

    const db = await getDb();
    const fullSelect =
      "id, name, type, model, endpoint, api_key, is_maintenance, template_id, request_header, metadata, group_name";
    const legacySelect =
      "id, name, type, model, endpoint, api_key, is_maintenance, request_header, metadata, group_name";
    const useLegacySelect = supportsTemplateId === false;

    let { data, error } = await db
      .from<CheckConfigRow>("check_configs")
      .select(useLegacySelect ? legacySelect : fullSelect)
      .eq("enabled", true)
      .order("id");

    if (error && !useLegacySelect && isMissingTemplateIdColumn(error as DbQueryError)) {
      supportsTemplateId = false;
      console.warn("[check-cx] 检测到数据库缺少 template_id，已降级为旧配置读取模式");
      const fallbackResult = await db
        .from<CheckConfigRow>("check_configs")
        .select(legacySelect)
        .eq("enabled", true)
        .order("id");
      data = fallbackResult.data;
      error = fallbackResult.error;
    } else if (!error && !useLegacySelect) {
      supportsTemplateId = true;
    }

    if (error) {
      logError("从数据库加载配置失败", error as DbQueryError);
      return [];
    }
    if (!data || data.length === 0) {
      console.warn("[check-cx] 数据库中没有找到启用的配置");
      cache.data = [];
      cache.lastFetchedAt = now;
      return [];
    }

    const configRows = data as ConfigProjection[];
    const templateIds = Array.from(
      new Set(
        configRows
          .map((row) => row.template_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    const templateMap = new Map<string, TemplateProjection>();
    if (supportsTemplateId !== false && templateIds.length > 0) {
      const { data: templates, error: templateError } = await db
        .from<TemplateProjection>("check_request_templates")
        .select("id, type, request_header, metadata")
        .in("id", templateIds);

      if (templateError) {
        logError("从数据库加载请求模板失败", templateError);
      } else if (templates) {
        for (const template of templates) {
          templateMap.set(template.id, template);
        }
      }
    }

    const configs: ProviderConfig[] = configRows.map((row) => {
      const template = getTemplate(row, templateMap);
      const mergedRequestHeaders = mergeTemplateAndConfig(
        template?.request_header,
        row.request_header
      ) as Record<string, string> | null;
      const mergedMetadata = mergeTemplateAndConfig(
        template?.metadata,
        row.metadata
      );

      return {
        id: row.id,
        name: row.name,
        type: row.type as ProviderType,
        endpoint: row.endpoint,
        model: row.model,
        apiKey: row.api_key,
        is_maintenance: row.is_maintenance,
        requestHeaders: mergedRequestHeaders,
        metadata: mergedMetadata,
        groupName: row.group_name || null,
      };
    });

    cache.data = configs;
    cache.lastFetchedAt = now;
    return configs;
  } catch (error) {
    logError("加载配置时发生异常", error);
    return [];
  }
}
