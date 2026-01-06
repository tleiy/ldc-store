import type { OrderStatus, PaymentMethod } from "@/lib/db";

export const DEFAULT_ADMIN_ORDERS_PAGE_SIZE = 20;

export function buildAdminOrdersHref(input: {
  q?: string;
  status?: OrderStatus;
  paymentMethod?: PaymentMethod;
  page?: number;
  pageSize?: number;
}): string {
  const params = new URLSearchParams();
  if (input.q) params.set("q", input.q);
  if (input.status) params.set("status", input.status);
  if (input.paymentMethod) params.set("paymentMethod", input.paymentMethod);
  if (input.pageSize && input.pageSize !== DEFAULT_ADMIN_ORDERS_PAGE_SIZE) {
    params.set("pageSize", String(input.pageSize));
  }
  if (input.page && input.page > 1) params.set("page", String(input.page));
  const queryString = params.toString();
  return queryString ? `/admin/orders?${queryString}` : "/admin/orders";
}

export function buildAdminOrdersExportUrl(input: {
  ids?: string[];
  q?: string;
  status?: OrderStatus;
  paymentMethod?: PaymentMethod;
  limit?: number;
}): string {
  const params = new URLSearchParams();
  if (input.ids && input.ids.length > 0) {
    params.set("ids", input.ids.join(","));
  } else {
    if (input.q) params.set("q", input.q);
    if (input.status) params.set("status", input.status);
    if (input.paymentMethod) params.set("paymentMethod", input.paymentMethod);
  }
  if (input.limit && input.limit > 0) params.set("limit", String(input.limit));
  const queryString = params.toString();
  return queryString ? `/api/admin/orders/export?${queryString}` : "/api/admin/orders/export";
}
