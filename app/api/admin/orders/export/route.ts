import { requireAdmin } from "@/lib/auth-utils";
import {
  db,
  orders,
  orderStatusEnum,
  paymentMethodEnum,
  type OrderStatus,
  type PaymentMethod,
} from "@/lib/db";
import { and, eq, ilike, inArray, or, type SQL } from "drizzle-orm";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toIsoString(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeEnumValue<T extends readonly string[]>(
  value: string | null,
  allowed: T
): T[number] | undefined {
  if (!value) return undefined;
  return allowed.includes(value) ? (value as T[number]) : undefined;
}

function buildWhere(filters: {
  ids?: string[];
  status?: OrderStatus;
  paymentMethod?: PaymentMethod;
  q?: string;
}): SQL | undefined {
  if (filters.ids && filters.ids.length > 0) {
    return inArray(orders.id, filters.ids);
  }

  const conditions: Array<SQL | undefined> = [];
  if (filters.status) conditions.push(eq(orders.status, filters.status));
  if (filters.paymentMethod) {
    conditions.push(eq(orders.paymentMethod, filters.paymentMethod));
  }

  const q = filters.q?.trim();
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        ilike(orders.orderNo, pattern),
        ilike(orders.email, pattern),
        ilike(orders.username, pattern),
        ilike(orders.userId, pattern),
        ilike(orders.tradeNo, pattern),
        ilike(orders.productName, pattern)
      )
    );
  }

  const normalized = conditions.filter((c): c is SQL => Boolean(c));
  return normalized.length > 0 ? and(...normalized) : undefined;
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const ids = (url.searchParams.get("ids") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const status = normalizeEnumValue(
      url.searchParams.get("status"),
      orderStatusEnum.enumValues
    ) as OrderStatus | undefined;
    const paymentMethod = normalizeEnumValue(
      url.searchParams.get("paymentMethod"),
      paymentMethodEnum.enumValues
    ) as PaymentMethod | undefined;
    const q = (url.searchParams.get("q") || "").trim();

    const limitFromQuery = Number.parseInt(url.searchParams.get("limit") || "", 10);
    const defaultLimit = 5000;
    const safeLimit = Number.isFinite(limitFromQuery)
      ? Math.min(5000, Math.max(1, limitFromQuery))
      : defaultLimit;
    const limit = ids.length > 0 ? Math.min(ids.length, 5000) : safeLimit;

    const where = buildWhere({
      ids: ids.length > 0 ? ids : undefined,
      status,
      paymentMethod,
      q: q || undefined,
    });

    const rows = await db.query.orders.findMany({
      columns: {
        id: true,
        orderNo: true,
        status: true,
        paymentMethod: true,
        productName: true,
        quantity: true,
        totalAmount: true,
        email: true,
        username: true,
        userId: true,
        tradeNo: true,
        refundReason: true,
        createdAt: true,
        paidAt: true,
      },
      where,
      orderBy: (o, { desc }) => [desc(o.createdAt)],
      limit,
    });

    const header = [
      "订单ID",
      "订单号",
      "状态",
      "支付方式",
      "商品",
      "数量",
      "金额(LDC)",
      "邮箱",
      "用户名",
      "用户ID",
      "支付单号",
      "创建时间(UTC)",
      "支付时间(UTC)",
      "退款原因",
    ];

    const lines = [
      header.join(","),
      ...rows.map((row) =>
        [
          row.id,
          row.orderNo,
          row.status,
          row.paymentMethod,
          row.productName,
          row.quantity,
          row.totalAmount,
          row.email,
          row.username,
          row.userId,
          row.tradeNo,
          toIsoString(row.createdAt),
          toIsoString(row.paidAt),
          row.refundReason,
        ]
          .map(csvEscape)
          .join(",")
      ),
    ];

    // 关键：加 UTF-8 BOM，提升 Excel 打开中文 CSV 的兼容性
    const body = `\ufeff${lines.join("\n")}`;
    const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    const filename = `orders_export_${stamp}.csv`;

    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Export failed",
      { status: 500 }
    );
  }
}

