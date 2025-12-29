"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createOrder } from "@/lib/actions/orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "sonner";
import { Loader2, Minus, Plus, ShoppingCart, CreditCard } from "lucide-react";

const orderFormSchema = z.object({
  quantity: z.number().int().min(1),
  email: z.string().email("请输入有效的邮箱地址"),
  queryPassword: z
    .string()
    .min(6, "查询密码至少6位")
    .max(32, "查询密码最多32位"),
  confirmPassword: z.string(),
}).refine((data) => data.queryPassword === data.confirmPassword, {
  message: "两次输入的密码不一致",
  path: ["confirmPassword"],
});

type OrderFormValues = z.infer<typeof orderFormSchema>;

interface OrderFormProps {
  productId: string;
  productName: string;
  price: number;
  stock: number;
  minQuantity: number;
  maxQuantity: number;
}

export function OrderForm({
  productId,
  productName,
  price,
  stock,
  minQuantity,
  maxQuantity,
}: OrderFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const effectiveMax = Math.min(maxQuantity, stock);

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      quantity: minQuantity,
      email: "",
      queryPassword: "",
      confirmPassword: "",
    },
  });

  const quantity = form.watch("quantity");
  const totalPrice = (price * quantity).toFixed(2);

  const updateQuantity = (delta: number) => {
    const newValue = quantity + delta;
    if (newValue >= minQuantity && newValue <= effectiveMax) {
      form.setValue("quantity", newValue);
    }
  };

  const onSubmit = (values: OrderFormValues) => {
    startTransition(async () => {
      const result = await createOrder({
        productId,
        quantity: values.quantity,
        email: values.email,
        queryPassword: values.queryPassword,
        paymentMethod: "ldc",
      });

      if (result.success) {
        toast.success("订单创建成功", {
          description: `订单号: ${result.orderNo}`,
        });

        if (result.paymentForm) {
          // 创建隐藏表单并 POST 提交到支付网关
          const form = document.createElement("form");
          form.method = "POST";
          form.action = result.paymentForm.actionUrl;
          form.style.display = "none";

          // 添加所有参数为隐藏字段
          Object.entries(result.paymentForm.params).forEach(([key, value]) => {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = key;
            input.value = value;
            form.appendChild(input);
          });

          document.body.appendChild(form);
          form.submit();
        } else {
          // 跳转到订单结果页
          router.push(`/order/result?orderNo=${result.orderNo}`);
        }
      } else {
        toast.error("下单失败", {
          description: result.message,
        });
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Quantity */}
        <div className="space-y-3">
          <Label className="text-base">购买数量</Label>
          <div className="flex items-center gap-4">
            <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-r-none"
                onClick={() => updateQuantity(-1)}
                disabled={quantity <= minQuantity}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                className="h-10 w-16 border-0 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                value={quantity}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= minQuantity && val <= effectiveMax) {
                    form.setValue("quantity", val);
                  }
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-l-none"
                onClick={() => updateQuantity(1)}
                disabled={quantity >= effectiveMax}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <span className="text-sm text-zinc-500">
              限购 {minQuantity}-{effectiveMax} 件
            </span>
          </div>
        </div>

        {/* Email */}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base">联系邮箱</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  className="h-11"
                  {...field}
                />
              </FormControl>
              <FormDescription>用于接收订单通知和卡密信息</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Query Password */}
        <FormField
          control={form.control}
          name="queryPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base">查询密码</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="设置6-32位查询密码"
                  className="h-11"
                  {...field}
                />
              </FormControl>
              <FormDescription>用于查询订单和提取卡密</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Confirm Password */}
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base">确认密码</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="再次输入查询密码"
                  className="h-11"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Total */}
        <div className="rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 p-4 dark:border-violet-900 dark:from-violet-950 dark:to-indigo-950">
          <div className="flex items-center justify-between">
            <span className="text-zinc-600 dark:text-zinc-400">
              {productName} × {quantity}
            </span>
            <span className="text-2xl font-bold text-violet-600 dark:text-violet-400">
              ¥{totalPrice}
            </span>
          </div>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          size="lg"
          className="w-full h-12 text-base font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              处理中...
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-5 w-5" />
              立即购买
            </>
          )}
        </Button>

        <p className="text-center text-xs text-zinc-500">
          点击购买即表示您同意我们的服务条款
        </p>
      </form>
    </Form>
  );
}

