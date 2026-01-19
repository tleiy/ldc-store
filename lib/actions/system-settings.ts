"use server";

import { db, settings } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-utils";
import { revalidateAllStoreCache } from "@/lib/cache";
import { DEFAULT_ORDER_EXPIRE_MINUTES } from "@/lib/order-config";
import { systemSettingsSchema, type SystemSettings, type SystemSettingsInput } from "@/lib/validations/system-settings";
import { inArray, sql } from "drizzle-orm";

const SYSTEM_SETTING_KEYS = {
  configPriority: "config.priority",
  siteName: "site.name",
  siteDescription: "site.description",
  siteIcon: "site.icon",
  orderExpireMinutes: "order.expire_minutes",
} as const;

function parseIntOrUndefined(value: string | null | undefined): number | undefined {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function getSystemSettings(): Promise<SystemSettings> {
  const DEFAULT_SITE_NAME = "LDC Store";
  const DEFAULT_SITE_DESCRIPTION = "基于 Linux DO Credit 的虚拟商品自动发卡平台";

  const envSiteName = process.env.NEXT_PUBLIC_SITE_NAME;
  const envSiteDescription = process.env.NEXT_PUBLIC_SITE_DESCRIPTION;

  const keys = Object.values(SYSTEM_SETTING_KEYS);
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, keys));

  const map = new Map<string, string | null>(rows.map((row) => [row.key, row.value]));

  const rawPriority = map.get(SYSTEM_SETTING_KEYS.configPriority);
  const configPriority = rawPriority === "env_first" ? "env_first" : "db_first";

  // 订单过期时间：根据优先级决定 DB vs env 的覆盖顺序
  const envExpireMinutes = parseIntOrUndefined(process.env.ORDER_EXPIRE_MINUTES);
  const dbExpireMinutes = parseIntOrUndefined(map.get(SYSTEM_SETTING_KEYS.orderExpireMinutes));
  const expireMinutes =
    configPriority === "env_first"
      ? (envExpireMinutes ?? dbExpireMinutes ?? DEFAULT_ORDER_EXPIRE_MINUTES)
      : (dbExpireMinutes ?? envExpireMinutes ?? DEFAULT_ORDER_EXPIRE_MINUTES);

  const dbSiteName = map.get(SYSTEM_SETTING_KEYS.siteName) ?? undefined;
  const dbSiteDescription = map.get(SYSTEM_SETTING_KEYS.siteDescription) ?? undefined;
  const dbSiteIcon = map.get(SYSTEM_SETTING_KEYS.siteIcon) ?? undefined;

  const resolvedSiteName =
    configPriority === "env_first"
      ? (envSiteName ?? dbSiteName ?? DEFAULT_SITE_NAME)
      : (dbSiteName ?? envSiteName ?? DEFAULT_SITE_NAME);

  const resolvedSiteDescription =
    configPriority === "env_first"
      ? (envSiteDescription ?? dbSiteDescription ?? DEFAULT_SITE_DESCRIPTION)
      : (dbSiteDescription ?? envSiteDescription ?? DEFAULT_SITE_DESCRIPTION);

  const candidate = {
    configPriority,
    siteName: resolvedSiteName,
    siteDescription: resolvedSiteDescription,
    siteIcon: dbSiteIcon ?? "Store",
    orderExpireMinutes: expireMinutes,
  };

  // 为什么这样做：DB 配置是运行时数据，可能被写入非法值；这里用 safeParse 兜底，避免因“单个脏字段”导致整站 500。
  const parsed = systemSettingsSchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }

  console.warn("系统配置存在非法值，已回退到默认配置:", parsed.error.issues);
  return {
    configPriority,
    siteName: envSiteName ?? DEFAULT_SITE_NAME,
    siteDescription: envSiteDescription ?? DEFAULT_SITE_DESCRIPTION,
    siteIcon: "Store",
    orderExpireMinutes: DEFAULT_ORDER_EXPIRE_MINUTES,
  };
}

export async function updateSystemSettings(input: SystemSettingsInput): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    await requireAdmin();
  } catch {
    return { success: false, message: "需要管理员权限" };
  }

  const validationResult = systemSettingsSchema.safeParse(input);
  if (!validationResult.success) {
    return {
      success: false,
      message: validationResult.error.issues[0]?.message || "参数错误",
    };
  }

  const now = new Date();
  const { configPriority, siteName, siteDescription, siteIcon, orderExpireMinutes } =
    validationResult.data;

  try {
    // 为什么这样做：系统配置需要“可覆盖 + 可回滚”；用 key-value 做幂等 upsert，避免多次保存产生重复记录。
    await db
      .insert(settings)
      .values([
        {
          key: SYSTEM_SETTING_KEYS.configPriority,
          value: configPriority,
          description: "配置来源优先级（db_first/env_first）",
          updatedAt: now,
        },
        {
          key: SYSTEM_SETTING_KEYS.siteName,
          value: siteName,
          description: "网站名称",
          updatedAt: now,
        },
        {
          key: SYSTEM_SETTING_KEYS.siteDescription,
          value: siteDescription,
          description: "网站描述",
          updatedAt: now,
        },
        {
          key: SYSTEM_SETTING_KEYS.siteIcon,
          value: siteIcon,
          description: "网站图标（Lucide icon name）",
          updatedAt: now,
        },
        {
          key: SYSTEM_SETTING_KEYS.orderExpireMinutes,
          value: String(orderExpireMinutes),
          description: "订单过期时间（分钟）",
          updatedAt: now,
        },
      ])
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: sql`excluded.value`,
          description: sql`excluded.description`,
          updatedAt: now,
        },
      });

    // 为什么这样做：前台页面包含 ISR 缓存；配置更新后需要主动清理，确保用户“马上看到”新配置。
    await revalidateAllStoreCache();

    return { success: true, message: "系统配置已更新（已热生效）" };
  } catch (error) {
    console.error("更新系统配置失败:", error);
    return { success: false, message: "更新失败，请稍后重试" };
  }
}
