import { describe, expect, it, vi } from "vitest";

// 关键：避免在单元测试中初始化真实数据库连接（lib/db 会强依赖 DATABASE_URL）
const transactionMock = vi.fn();
const revalidatePathMock = vi.fn();
const requireAdminMock = vi.fn();

// 为什么要 mock drizzle-orm：单元测试只关心“业务分支/调用次数”，不需要真实 SQL AST，
// 同时避免因为 schema column 对象缺失导致 eq/inArray 等在运行时抛错。
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ type: "and", args }),
  eq: (...args: unknown[]) => ({ type: "eq", args }),
  ilike: (...args: unknown[]) => ({ type: "ilike", args }),
  inArray: (...args: unknown[]) => ({ type: "inArray", args }),
  or: (...args: unknown[]) => ({ type: "or", args }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: "sql",
    strings,
    values,
  }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
  orders: {},
  cards: {},
}));

vi.mock("@/lib/auth-utils", () => ({
  requireAdmin: () => requireAdminMock(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

import { deleteAdminOrders } from "@/lib/actions/admin-orders";

describe("deleteAdminOrders", () => {
  it("should reject when not admin", async () => {
    requireAdminMock.mockRejectedValueOnce(new Error("no"));

    const result = await deleteAdminOrders(["o1"]);

    expect(result.success).toBe(false);
    expect(result.message).toContain("管理员");
  });

  it("should reject when no ids provided", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "a1", role: "admin" } });

    const result = await deleteAdminOrders(["", "  "]);

    expect(result.success).toBe(false);
    expect(result.message).toContain("未选择");
  });

  it("should reject when too many ids", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "a1", role: "admin" } });

    const tooMany = Array.from({ length: 201 }, (_, i) => `o${i}`);
    const result = await deleteAdminOrders(tooMany);

    expect(result.success).toBe(false);
    expect(result.message).toContain("最多");
  });

  it("should allow deleting completed orders", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "a1", role: "admin" } });

    transactionMock.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(async () => [{ id: "o1" }]),
          })),
        })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(async () => undefined),
          })),
        })),
        delete: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => [{ id: "o1" }]),
          })),
        })),
      };
      return fn(tx);
    });

    const result = await deleteAdminOrders(["o1"]);

    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(1);
  });

  it("should report notFound ids when partially missing", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "a1", role: "admin" } });

    const deleteCall = vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => [{ id: "o1" }, { id: "o2" }]),
      })),
    }));

    transactionMock.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(async () => [
              { id: "o1" },
              { id: "o2" },
            ]),
          })),
        })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(async () => undefined),
          })),
        })),
        delete: deleteCall,
      };
      return fn(tx);
    });

    const result = await deleteAdminOrders(["o1", "o2", "missing"]);

    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(2);
    expect(result.notFoundCount).toBe(1);
    expect(deleteCall).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalled();
  });
});
