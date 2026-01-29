"use server";

import { auth } from "@/lib/auth";
import { revalidateAllStoreCache } from "@/lib/cache";
import { db, restockRequests } from "@/lib/db";
import { desc, inArray, lte, sql } from "drizzle-orm";

export interface RestockRequester {
  userId: string;
  username: string;
  userImage?: string | null;
}

export interface RestockSummary {
  count: number;
  requesters: RestockRequester[];
}

const DEFAULT_MAX_REQUESTERS = 5;

function normalizeIds(ids: string[]): string[] {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

/**
 * 获取商品的「催补货」聚合信息（计数 + 最近 N 个头像）
 * - 仅返回与用户无关的数据，确保可用于 ISR 页面而不会导致缓存穿透/泄露
 */
export async function getRestockSummaryForProducts(input: {
  productIds: string[];
  maxRequesters?: number;
}): Promise<Record<string, RestockSummary>> {
  const productIds = normalizeIds(input.productIds);
  const maxRequesters = Math.max(1, input.maxRequesters ?? DEFAULT_MAX_REQUESTERS);

  if (productIds.length === 0) {
    return {};
  }

  try {
    const counts = await db
      .select({
        productId: restockRequests.productId,
        count: sql<number>`count(*)::int`,
      })
      .from(restockRequests)
      .where(inArray(restockRequests.productId, productIds))
      .groupBy(restockRequests.productId);

    const countMap = new Map(counts.map((row) => [row.productId, row.count]));

    // 每个商品取最近 N 条
    const ranked = db
      .select({
        productId: restockRequests.productId,
        userId: restockRequests.userId,
        username: restockRequests.username,
        userImage: restockRequests.userImage,
        createdAt: restockRequests.createdAt,
        rn: sql<number>`
          row_number() over (
            partition by ${restockRequests.productId}
            order by ${restockRequests.createdAt} desc
          )
        `.as("rn"),
      })
      .from(restockRequests)
      .where(inArray(restockRequests.productId, productIds))
      .as("ranked_restock_requests");

    const requesterRows = await db
      .select({
        productId: ranked.productId,
        userId: ranked.userId,
        username: ranked.username,
        userImage: ranked.userImage,
        createdAt: ranked.createdAt,
      })
      .from(ranked)
      .where(lte(ranked.rn, maxRequesters))
      .orderBy(ranked.productId, desc(ranked.createdAt));

    const requesterMap = new Map<string, RestockRequester[]>();
    for (const row of requesterRows) {
      const list = requesterMap.get(row.productId) ?? [];
      list.push({
        userId: row.userId,
        username: row.username,
        userImage: row.userImage ?? null,
      });
      requesterMap.set(row.productId, list);
    }

    const result: Record<string, RestockSummary> = {};
    for (const productId of productIds) {
      result[productId] = {
        count: countMap.get(productId) ?? 0,
        requesters: requesterMap.get(productId) ?? [],
      };
    }

    return result;
  } catch (error) {
    console.error("[getRestockSummaryForProducts] 查询催补货统计失败:", error);
    return {};
  }
}

export interface RequestRestockResult {
  success: boolean;
  message: string;
  summary?: RestockSummary;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function publicRestockErrorMessage(error: unknown): string {
  // 不要把底层数据库错误（含 SQL / 参数）透传到客户端
  const code = (error as any)?.code as string | undefined;

  // 外键约束：商品不存在/已删除
  if (code === "23503") {
    return "商品信息无效或已下架，请刷新页面后重试";
  }

  // 唯一冲突：通常是并发点击导致（用户已催过）
  if (code === "23505") {
    return "你已经催过该商品啦";
  }

  return "催补货失败，请稍后重试";
}

function logDbError(scope: string, error: unknown) {
  const e = error as any;
  // 避免把 "Failed query: ... params: ..." 写进日志
  console.error(scope, {
    code: e?.code,
    detail: e?.detail,
    constraint: e?.constraint,
    table: e?.table,
  });
}

/**
 * 记录一次「催补货」请求（按 userId 去重）
 */
export async function requestRestock(productId: string): Promise<RequestRestockResult> {
  const session = await auth();
  const user = session?.user as
    | { id?: string; username?: string; name?: string; image?: string; provider?: string }
    | undefined;

  if (!user?.id || user.provider !== "linux-do") {
    return { success: false, message: "请先使用 Linux DO 登录后再催补货" };
  }

  const safeProductId = productId.trim();
  if (!safeProductId || !isUuid(safeProductId)) {
    return { success: false, message: "商品信息无效" };
  }

  const username = (user.username || user.name || "用户").trim() || "用户";
  const userImage = user.image ?? null;

  try {
    // 更稳：先 UPDATE，若不存在再 INSERT（不依赖 ON CONFLICT）
    await db.execute(sql`
      WITH updated AS (
        UPDATE restock_requests
        SET username = ${username},
            user_image = ${userImage}
        WHERE product_id = ${safeProductId}
          AND user_id = ${user.id}
        RETURNING 1
      )
      INSERT INTO restock_requests (product_id, user_id, username, user_image)
      SELECT ${safeProductId}, ${user.id}, ${username}, ${userImage}
      WHERE NOT EXISTS (SELECT 1 FROM updated);
    `);

    await revalidateAllStoreCache();

    const summaryMap = await getRestockSummaryForProducts({ productIds: [safeProductId] });
    return {
      success: true,
      message: "已为你登记催补货",
      summary: summaryMap[safeProductId],
    };
  } catch (error) {
    logDbError("[requestRestock] 记录催补货失败", error);

    // 并发造成的 23505：当作“已催”返回最新统计
    const code = (error as any)?.code as string | undefined;
    if (code === "23505") {
      const summaryMap = await getRestockSummaryForProducts({ productIds: [safeProductId] });
      return {
        success: true,
        message: "你已经催过该商品啦",
        summary: summaryMap[safeProductId],
      };
    }

    return {
      success: false,
      message: publicRestockErrorMessage(error),
    };
  }
}
