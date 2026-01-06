import type { OrderStatus, PaymentMethod } from "@/lib/db";

export const orderStatusConfig: Record<
  OrderStatus,
  { label: string; color: string }
> = {
  pending: {
    label: "待支付",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  },
  paid: {
    label: "已支付",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  completed: {
    label: "已完成",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  },
  expired: {
    label: "已过期",
    color: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  },
  refund_pending: {
    label: "退款审核中",
    color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  },
  refund_rejected: {
    label: "退款已拒绝",
    color: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  },
  refunded: {
    label: "已退款",
    color: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
  },
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  ldc: "LDC 积分",
  alipay: "支付宝",
  wechat: "微信",
  usdt: "USDT",
};

