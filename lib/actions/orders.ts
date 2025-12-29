"use server";

import { db, orders, cards, products } from "@/lib/db";
import { eq, and, sql, or, desc, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { createOrderSchema, type CreateOrderInput } from "@/lib/validations/order";
import { createPayment, type PaymentFormData } from "@/lib/payment/ldc";
import { revalidatePath } from "next/cache";

/**
 * 从请求头自动获取网站 URL
 */
async function getSiteUrl(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = headersList.get("x-forwarded-proto") || "http";
  return `${protocol}://${host}`;
}

// 生成订单号: 时间戳 + 随机字符
function generateOrderNo(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = nanoid(6).toUpperCase();
  return `LD${timestamp}${random}`;
}

// 订单过期时间（分钟）
const ORDER_EXPIRE_MINUTES = parseInt(process.env.ORDER_EXPIRE_MINUTES || "30", 10);

export interface CreateOrderResult {
  success: boolean;
  message: string;
  orderNo?: string;
  paymentForm?: PaymentFormData;
}

/**
 * 创建订单
 * 1. 验证输入
 * 2. 检查库存
 * 3. 创建订单并锁定卡密（使用事务）
 * 4. 调用支付接口获取支付链接
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  // 1. 验证输入
  const validationResult = createOrderSchema.safeParse(input);
  if (!validationResult.success) {
    return {
      success: false,
      message: validationResult.error.issues[0].message,
    };
  }

  const { productId, quantity, email, queryPassword, paymentMethod } = validationResult.data;

  try {
    // 2. 获取商品信息
    const product = await db.query.products.findFirst({
      where: and(eq(products.id, productId), eq(products.isActive, true)),
    });

    if (!product) {
      return { success: false, message: "商品不存在或已下架" };
    }

    // 验证购买数量限制
    if (quantity < product.minQuantity || quantity > product.maxQuantity) {
      return {
        success: false,
        message: `购买数量需在 ${product.minQuantity} - ${product.maxQuantity} 之间`,
      };
    }

    // 3. 使用事务处理订单创建和卡密锁定
    const result = await db.transaction(async (tx) => {
      // 3.1 查询可用库存（使用 FOR UPDATE 锁定行）
      const availableCards = await tx
        .select({ id: cards.id })
        .from(cards)
        .where(and(eq(cards.productId, productId), eq(cards.status, "available")))
        .limit(quantity)
        .for("update");

      if (availableCards.length < quantity) {
        throw new Error(`库存不足，当前仅剩 ${availableCards.length} 件`);
      }

      const cardIds = availableCards.map((c) => c.id);
      const orderNo = generateOrderNo();
      const totalAmount = parseFloat(product.price) * quantity;
      const hashedPassword = await bcrypt.hash(queryPassword, 10);
      const expiredAt = new Date(Date.now() + ORDER_EXPIRE_MINUTES * 60 * 1000);

      // 3.2 创建订单
      const [newOrder] = await tx
        .insert(orders)
        .values({
          orderNo,
          productId,
          productName: product.name,
          productPrice: product.price,
          quantity,
          totalAmount: totalAmount.toFixed(2),
          paymentMethod,
          email,
          queryPassword: hashedPassword,
          expiredAt,
        })
        .returning();

      // 3.3 锁定卡密
      await tx
        .update(cards)
        .set({
          status: "locked",
          orderId: newOrder.id,
          lockedAt: new Date(),
        })
        .where(
          and(
            eq(cards.productId, productId),
            eq(cards.status, "available"),
            inArray(cards.id, cardIds)
          )
        );

      return { order: newOrder, totalAmount };
    });

    // 4. 调用支付接口（如果是 LDC 支付）
    let paymentForm: PaymentFormData | undefined;
    if (paymentMethod === "ldc") {
      try {
        const siteUrl = await getSiteUrl();
        paymentForm = createPayment(
          result.order.orderNo,
          result.totalAmount,
          product.name,
          siteUrl
        );
      } catch (error) {
        // 支付接口调用失败，但订单已创建
        console.error("创建支付链接失败:", error);
        return {
          success: true,
          message: "订单创建成功，但支付链接生成失败，请稍后重试支付",
          orderNo: result.order.orderNo,
        };
      }
    }

    return {
      success: true,
      message: "订单创建成功",
      orderNo: result.order.orderNo,
      paymentForm,
    };
  } catch (error) {
    console.error("创建订单失败:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "创建订单失败，请稍后重试",
    };
  }
}

/**
 * 查询订单
 * 支持通过订单号或邮箱 + 查询密码查询
 */
export async function queryOrder(orderNoOrEmail: string, queryPassword: string) {
  try {
    // 根据输入判断是订单号还是邮箱
    const isEmail = orderNoOrEmail.includes("@");

    const orderList = await db.query.orders.findMany({
      where: isEmail
        ? eq(orders.email, orderNoOrEmail)
        : eq(orders.orderNo, orderNoOrEmail),
      with: {
        cards: {
          columns: {
            id: true,
            content: true,
            status: true,
          },
        },
      },
      orderBy: [desc(orders.createdAt)],
    });

    if (orderList.length === 0) {
      return { success: false, message: "订单不存在" };
    }

    // 验证密码（检查所有匹配订单）
    for (const order of orderList) {
      const isValid = await bcrypt.compare(queryPassword, order.queryPassword);
      if (isValid) {
        // 如果是查询单个订单号，返回该订单
        if (!isEmail) {
          // 仅当订单已完成时才显示卡密
          const cardsToShow =
            order.status === "completed" || order.status === "paid"
              ? order.cards.filter((c) => c.status === "sold")
              : [];

          return {
            success: true,
            data: {
              orderNo: order.orderNo,
              productName: order.productName,
              quantity: order.quantity,
              totalAmount: order.totalAmount,
              status: order.status,
              paymentMethod: order.paymentMethod,
              createdAt: order.createdAt,
              paidAt: order.paidAt,
              cards: cardsToShow.map((c) => c.content),
            },
          };
        }

        // 如果是邮箱查询，返回该邮箱下所有订单
        const ordersWithCards = await Promise.all(
          orderList.map(async (o) => {
            const passValid = await bcrypt.compare(queryPassword, o.queryPassword);
            if (!passValid) return null;

            const cardsToShow =
              o.status === "completed" || o.status === "paid"
                ? o.cards.filter((c) => c.status === "sold")
                : [];

            return {
              orderNo: o.orderNo,
              productName: o.productName,
              quantity: o.quantity,
              totalAmount: o.totalAmount,
              status: o.status,
              paymentMethod: o.paymentMethod,
              createdAt: o.createdAt,
              paidAt: o.paidAt,
              cards: cardsToShow.map((c) => c.content),
            };
          })
        );

        return {
          success: true,
          data: ordersWithCards.filter(Boolean),
        };
      }
    }

    return { success: false, message: "查询密码错误" };
  } catch (error) {
    console.error("查询订单失败:", error);
    return {
      success: false,
      message: "查询失败，请稍后重试",
    };
  }
}

/**
 * 处理支付成功回调
 * 1. 更新订单状态
 * 2. 更新卡密状态为已售出
 * 3. 更新商品销量
 */
export async function handlePaymentSuccess(
  orderNo: string,
  tradeNo: string
): Promise<boolean> {
  try {
    await db.transaction(async (tx) => {
      // 1. 获取并更新订单
      const [order] = await tx
        .update(orders)
        .set({
          status: "completed",
          tradeNo,
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(orders.orderNo, orderNo), eq(orders.status, "pending")))
        .returning();

      if (!order) {
        throw new Error("订单不存在或已处理");
      }

      // 2. 更新卡密状态为已售出
      await tx
        .update(cards)
        .set({
          status: "sold",
          soldAt: new Date(),
        })
        .where(eq(cards.orderId, order.id));

      // 3. 更新商品销量
      if (order.productId) {
        await tx
          .update(products)
          .set({
            salesCount: sql`${products.salesCount} + ${order.quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(products.id, order.productId));
      }
    });

    revalidatePath("/admin/orders");
    revalidatePath("/admin");
    return true;
  } catch (error) {
    console.error("处理支付成功回调失败:", error);
    return false;
  }
}

/**
 * 释放过期订单的锁定卡密
 * 应该通过定时任务调用
 */
export async function releaseExpiredOrders(): Promise<number> {
  try {
    const result = await db.transaction(async (tx) => {
      // 1. 找出所有过期的待支付订单
      const expiredOrders = await tx
        .update(orders)
        .set({
          status: "expired",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orders.status, "pending"),
            sql`${orders.expiredAt} < NOW()`
          )
        )
        .returning({ id: orders.id });

      if (expiredOrders.length === 0) {
        return 0;
      }

      // 2. 释放这些订单锁定的卡密
      const orderIds = expiredOrders.map((o) => o.id);
      await tx
        .update(cards)
        .set({
          status: "available",
          orderId: null,
          lockedAt: null,
        })
        .where(
          and(
            eq(cards.status, "locked"),
            inArray(cards.orderId, orderIds)
          )
        );

      return expiredOrders.length;
    });

    revalidatePath("/admin/orders");
    return result;
  } catch (error) {
    console.error("释放过期订单失败:", error);
    return 0;
  }
}

/**
 * 管理员手动完成订单
 */
export async function adminCompleteOrder(
  orderId: string,
  adminRemark?: string
): Promise<{ success: boolean; message: string }> {
  try {
    await db.transaction(async (tx) => {
      // 1. 更新订单状态
      const [order] = await tx
        .update(orders)
        .set({
          status: "completed",
          paidAt: new Date(),
          adminRemark,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning();

      if (!order) {
        throw new Error("订单不存在");
      }

      // 2. 更新卡密状态
      await tx
        .update(cards)
        .set({
          status: "sold",
          soldAt: new Date(),
        })
        .where(eq(cards.orderId, order.id));

      // 3. 更新销量
      if (order.productId) {
        await tx
          .update(products)
          .set({
            salesCount: sql`${products.salesCount} + ${order.quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(products.id, order.productId));
      }
    });

    revalidatePath("/admin/orders");
    revalidatePath("/admin");
    return { success: true, message: "订单已完成" };
  } catch (error) {
    console.error("手动完成订单失败:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "操作失败",
    };
  }
}

