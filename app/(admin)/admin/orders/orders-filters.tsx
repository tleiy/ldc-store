"use client";

import type { ReactNode } from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import type { OrderStatus, PaymentMethod } from "@/lib/db";

import { orderStatusConfig, paymentMethodLabels } from "./order-meta";
import { buildAdminOrdersExportUrl, buildAdminOrdersHref } from "./orders-url";

function triggerDownload(url: string) {
  // 为什么这样做：用动态创建 <a> 点击的方式触发下载，避免导航到 /api 导致当前页面“跳走”。
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function Select({
  name,
  defaultValue,
  children,
  className,
  ariaLabel,
}: {
  name: string;
  defaultValue?: string;
  children: ReactNode;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      aria-label={ariaLabel}
      className={
        className ??
        "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {children}
    </select>
  );
}

export function OrdersFilters({
  q,
  status,
  paymentMethod,
  pageSize,
}: {
  q: string;
  status?: OrderStatus;
  paymentMethod?: PaymentMethod;
  pageSize: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const hasActiveFilters = Boolean(q || status || paymentMethod);

  const submit = (form: HTMLFormElement) => {
    const formData = new FormData(form);
    const nextQ = String(formData.get("q") || "").trim();
    const nextStatus = String(formData.get("status") || "").trim();
    const nextPaymentMethod = String(formData.get("paymentMethod") || "").trim();
    const nextPageSize = Number.parseInt(String(formData.get("pageSize") || ""), 10);

    const normalizedStatus =
      nextStatus && nextStatus in orderStatusConfig
        ? (nextStatus as OrderStatus)
        : undefined;
    const normalizedPaymentMethod =
      nextPaymentMethod && nextPaymentMethod in paymentMethodLabels
        ? (nextPaymentMethod as PaymentMethod)
        : undefined;

    const nextHref = buildAdminOrdersHref({
      q: nextQ || undefined,
      status: normalizedStatus,
      paymentMethod: normalizedPaymentMethod,
      pageSize: Number.isFinite(nextPageSize) ? nextPageSize : pageSize,
    });

    startTransition(() => {
      router.push(nextHref);
    });
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form
          className="flex flex-col gap-3 lg:flex-row lg:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            submit(e.currentTarget);
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={q}
              placeholder="搜索订单号/邮箱/用户名/支付单号/商品名…"
              className="pl-9 pr-9"
              aria-label="搜索订单"
            />
            {q ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                onClick={() =>
                  router.push(
                    buildAdminOrdersHref({ status, paymentMethod, pageSize })
                  )
                }
                aria-label="清空搜索"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <Select
              name="status"
              defaultValue={status ?? ""}
              ariaLabel="按状态筛选"
            >
              <option value="">全部状态</option>
              {Object.entries(orderStatusConfig).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </Select>

            <Select
              name="paymentMethod"
              defaultValue={paymentMethod ?? ""}
              ariaLabel="按支付方式筛选"
            >
              <option value="">全部支付方式</option>
              {Object.entries(paymentMethodLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>

            <Select
              name="pageSize"
              defaultValue={String(pageSize)}
              ariaLabel="每页条数"
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={String(size)}>
                  {size}/页
                </option>
              ))}
            </Select>

            <Button type="submit" disabled={isPending}>
              应用筛选
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() =>
                triggerDownload(
                  buildAdminOrdersExportUrl({
                    q: q || undefined,
                    status,
                    paymentMethod,
                  })
                )
              }
            >
              导出筛选结果
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/admin/orders")}
              disabled={isPending || !hasActiveFilters}
            >
              重置
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
