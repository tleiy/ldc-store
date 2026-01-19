"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Clock,
  Globe,
  Loader2,
  Package,
  Rocket,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Store,
  Zap,
  CreditCard,
  Gem,
  RefreshCcw,
  type LucideIcon,
} from "lucide-react";

import { updateSystemSettings } from "@/lib/actions/system-settings";
import {
  systemSettingsSchema,
  SITE_ICON_OPTIONS,
  type SiteIconOption,
  type SystemSettings,
  type SystemSettingsInput,
} from "@/lib/validations/system-settings";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const SITE_ICON_MAP: Record<SiteIconOption, LucideIcon> = {
  Store,
  Sparkles,
  ShoppingCart,
  Package,
  CreditCard,
  Gem,
  Rocket,
  Shield,
  Zap,
};

interface SystemConfigFormProps {
  initialValues: SystemSettings;
}

export function SystemConfigForm({ initialValues }: SystemConfigFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const form = useForm<SystemSettingsInput>({
    resolver: zodResolver(systemSettingsSchema),
    defaultValues: initialValues,
    mode: "onBlur",
  });

  const watchedName = useWatch({ control: form.control, name: "siteName" });
  const watchedDescription = useWatch({ control: form.control, name: "siteDescription" });
  const watchedIcon = useWatch({ control: form.control, name: "siteIcon" });
  const watchedPriority = useWatch({ control: form.control, name: "configPriority" });

  const PreviewIcon = useMemo(() => {
    // 为什么这样做：即便 DB 被写入非法 icon，也不要让页面崩；这里做一次兜底，确保始终有可渲染的 icon。
    return SITE_ICON_MAP[watchedIcon as SiteIconOption] ?? Store;
  }, [watchedIcon]);

  const onSubmit = (values: SystemSettingsInput) => {
    startTransition(async () => {
      const result = await updateSystemSettings(values);
      if (result.success) {
        toast.success(result.message);
        // 为什么这样做：后台页面是 force-dynamic，但仍需要 refresh 才能刷新 server component 的初始值与提示信息。
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  const handleReset = () => {
    // 为什么这样做：系统配置属于“全局状态”，误操作成本高；提供一键回滚到当前值，降低保存前的焦虑。
    form.reset(initialValues);
    toast.message("已恢复为当前保存的配置");
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings className="h-5 w-5" />
                  配置来源优先级
                </CardTitle>
                <CardDescription>
                  控制“环境变量 vs 数据库（系统配置）”的覆盖顺序
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="configPriority"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border bg-muted/40 p-4">
                      <div className="space-y-1">
                        <FormLabel className="text-sm">环境变量优先</FormLabel>
                        <FormDescription>
                          开启后：若对应环境变量已配置，将覆盖数据库配置；关闭则相反。
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value === "env_first"}
                          onCheckedChange={(checked) =>
                            field.onChange(checked ? "env_first" : "db_first")
                          }
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="text-xs text-muted-foreground">
                  当前模式：
                  <span className="ml-1 font-medium text-foreground">
                    {watchedPriority === "env_first" ? "环境变量优先" : "数据库优先"}
                  </span>
                  。
                  {watchedPriority === "env_first" ? (
                    <span>
                      如果你在 Vercel/服务器里配置了 <code>NEXT_PUBLIC_SITE_NAME</code>、
                      <code>NEXT_PUBLIC_SITE_DESCRIPTION</code>、<code>ORDER_EXPIRE_MINUTES</code>，
                      那么这里保存到数据库的值仅作为兜底（环境变量为空/非法时才会使用）。
                    </span>
                  ) : (
                    <span>
                      数据库中保存的站点名称/描述/订单过期时间会覆盖环境变量（只要 DB 值合法）。
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe className="h-5 w-5" />
                  站点信息
                </CardTitle>
                <CardDescription>
                  这些配置会影响前台 Header/页面标题等展示（保存后立即生效）
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="siteName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>网站名称 *</FormLabel>
                      <FormControl>
                        <Input placeholder="例如：LDC Store" {...field} />
                      </FormControl>
                      <FormDescription>用于前台标题、Footer 版权等。</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="siteDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>网站描述</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="一句话介绍（可选）"
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        建议控制在 1-2 句话，过长会影响 SEO 与分享卡片展示。
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="siteIcon"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>网站图标</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(value) =>
                            field.onChange(value as SiteIconOption)
                          }
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="选择图标" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {SITE_ICON_OPTIONS.map((value) => {
                              const Icon = SITE_ICON_MAP[value];
                              return (
                                <SelectItem key={value} value={value}>
                                  <div className="flex items-center gap-2">
                                    <Icon className="h-4 w-4" />
                                    <span>{value}</span>
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="rounded-lg border bg-muted/40 p-4">
                    <p className="text-sm text-muted-foreground">预览</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="inline-flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-border/50">
                        <PreviewIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {watchedName || "—"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {watchedDescription || "未填写描述"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-5 w-5" />
                  订单与超时
                </CardTitle>
                <CardDescription>
                  用于控制“未支付订单”多久后过期并释放库存
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="orderExpireMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>订单过期时间（分钟）*</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={1440}
                          {...field}
                          onChange={(e) => {
                            const next = Number.parseInt(e.target.value, 10);
                            // 为什么这样做：Input 的值是 string；这里提前转为 number，避免服务端校验失败。
                            field.onChange(Number.isFinite(next) ? next : 0);
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        保存后会影响新创建的订单；已创建订单仍按其自身的过期时间计算。
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings className="h-5 w-5" />
                  配置来源优先级
                </CardTitle>
                <CardDescription>
                  控制“环境变量 vs 数据库（系统配置）”的覆盖顺序
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="configPriority"
                  render={({ field }) => (
                    <FormItem className="flex items-start justify-between gap-4 rounded-lg border bg-muted/40 p-4">
                      <div className="space-y-1">
                        <FormLabel className="text-sm">环境变量优先</FormLabel>
                        <FormDescription className="text-xs">
                          开启后：若已设置对应环境变量（如 <code>NEXT_PUBLIC_SITE_NAME</code>），将覆盖数据库中的值；数据库仅作为兜底。
                          关闭后：数据库优先，环境变量兜底（当前项目默认行为）。
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value === "env_first"}
                          onCheckedChange={(checked) =>
                            field.onChange(checked ? "env_first" : "db_first")
                          }
                          aria-label="环境变量优先"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="rounded-lg border bg-muted/40 p-4 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">当前模式</p>
                  {watchedPriority === "env_first" ? (
                    <ul className="list-disc pl-4 space-y-1">
                      <li>环境变量优先生效（推荐用于 Vercel：配置跟随项目环境变量）。</li>
                      <li>修改环境变量通常需要重新部署后生效；数据库配置仍可作为兜底。</li>
                    </ul>
                  ) : (
                    <ul className="list-disc pl-4 space-y-1">
                      <li>数据库优先生效（热更新体验更好）。</li>
                      <li>环境变量仅在数据库未配置/无效时才会兜底生效。</li>
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings className="h-5 w-5" />
                  生效说明
                </CardTitle>
                <CardDescription>
                  配置会写入数据库，保存后立即生效
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="mt-0.5 inline-flex size-5 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                      <Sparkles className="h-3.5 w-3.5" />
                    </span>
                    <span>站点名称/图标等展示配置：刷新页面即可看到变化。</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 inline-flex size-5 items-center justify-center rounded-md bg-amber-500/10 text-amber-800 dark:text-amber-400">
                      <Clock className="h-3.5 w-3.5" />
                    </span>
                    <span>订单过期时间：仅影响后续新订单。</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 inline-flex size-5 items-center justify-center rounded-md bg-zinc-500/10 text-zinc-700 dark:text-zinc-300">
                      <Shield className="h-3.5 w-3.5" />
                    </span>
                    <span>敏感配置（OAuth/支付密钥等）：仍需通过环境变量设置。</span>
                  </li>
                </ul>

                <div className="flex flex-col gap-2">
                  <Button type="submit" disabled={isPending} className="gap-2">
                    {isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        保存中...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        保存并热更新
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleReset}
                    disabled={isPending}
                    className="gap-2"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    恢复为当前配置
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </Form>
  );
}
