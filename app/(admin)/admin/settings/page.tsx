export const dynamic = "force-dynamic";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Settings, Globe, CreditCard, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";

async function getDbSystemSettingsOrNull() {
  if (!process.env.DATABASE_URL) return null;
  try {
    // 为什么这样做：该页面用于“环境检查”；当 DATABASE_URL 未配置时也应可打开，因此用动态 import 避免在模块加载阶段直接抛错。
    const { getSystemSettings } = await import("@/lib/actions/system-settings");
    return await getSystemSettings();
  } catch (error) {
    console.error("加载系统配置失败:", error);
    return null;
  }
}

export default async function SystemStatusPage() {
  const dbSettings = await getDbSystemSettingsOrNull();
  // 从环境变量读取配置
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "LDC Store";
  const siteDescription = process.env.NEXT_PUBLIC_SITE_DESCRIPTION || "未配置";

  // 检查数据库配置
  const isDatabaseConfigured = !!process.env.DATABASE_URL;

  // 检查认证配置
  const isAuthSecretConfigured = !!process.env.AUTH_SECRET;
  const authTrustHost = process.env.AUTH_TRUST_HOST;
  const isAuthTrustHostConfigured = authTrustHost === "true" || authTrustHost === "1";
  const isAdminPasswordConfigured = !!process.env.ADMIN_PASSWORD;

  // 检查用户登录（Linux DO OAuth2）配置
  const linuxdoClientId = process.env.LINUXDO_CLIENT_ID;
  const linuxdoClientSecret = process.env.LINUXDO_CLIENT_SECRET;
  const isLinuxDoOAuthConfigured = !!(linuxdoClientId && linuxdoClientSecret);

  // 检查支付配置
  const ldcClientId = process.env.LDC_CLIENT_ID;
  const ldcClientSecret = process.env.LDC_CLIENT_SECRET;
  const isPaymentConfigured = !!(ldcClientId && ldcClientSecret);

  const configStatus = [
    {
      title: "数据库",
      env: "DATABASE_URL",
      ok: isDatabaseConfigured,
      hint: "连接 PostgreSQL",
    },
    {
      title: "NextAuth 密钥",
      env: "AUTH_SECRET",
      ok: isAuthSecretConfigured,
      hint: "用于会话/JWT 加密",
    },
    {
      title: "信任主机",
      env: "AUTH_TRUST_HOST",
      ok: isAuthTrustHostConfigured,
      hint: "Vercel 部署通常需要 true",
    },
    {
      title: "管理员密码",
      env: "ADMIN_PASSWORD",
      ok: isAdminPasswordConfigured,
      hint: "后台密码登录凭证",
    },
    {
      title: "Linux DO OAuth2",
      env: "LINUXDO_CLIENT_ID / LINUXDO_CLIENT_SECRET",
      ok: isLinuxDoOAuthConfigured,
      hint: "用户下单/查单必须",
    },
    {
      title: "Linux DO Credit",
      env: "LDC_CLIENT_ID / LDC_CLIENT_SECRET",
      ok: isPaymentConfigured,
      hint: "积分支付",
    },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          系统状态
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          查看当前系统运行与配置状态（可热更新配置请前往{" "}
          <Link href="/admin/system-config" className="underline underline-offset-4">
            系统配置
          </Link>
          ）
        </p>
      </div>

      <div className="grid gap-6">
        {/* Configuration Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-5 w-5" />
              配置状态
            </CardTitle>
            <CardDescription>
              仅展示是否已配置，不会显示敏感值
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {configStatus.map((item) => (
                <div key={item.env} className="flex items-start justify-between gap-3 rounded-lg border bg-muted/50 p-4">
                  <div className="flex items-start gap-3">
                    {item.ok ? (
                      <CheckCircle className="h-5 w-5 text-emerald-500 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-rose-500 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.hint}</p>
                      <p className="text-xs text-muted-foreground">
                        环境变量: {item.env}
                      </p>
                    </div>
                  </div>
                  <Badge variant={item.ok ? "secondary" : "outline"}>
                    {item.ok ? "已配置" : "未配置"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Site Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-5 w-5" />
              站点配置
            </CardTitle>
            <CardDescription>
              {dbSettings?.configPriority === "env_first"
                ? "环境变量优先，系统配置（DB）兜底；敏感配置仍需通过环境变量修改并重启"
                : "系统配置（DB）优先，环境变量兜底；敏感配置仍需通过环境变量修改并重启"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">网站名称</p>
                <p className="font-medium">{dbSettings?.siteName ?? siteName}</p>
                <p className="text-xs text-muted-foreground">
                  {dbSettings ? (
                    dbSettings.configPriority === "env_first" ? (
                      <>
                        当前为<strong>环境变量优先</strong>；环境变量覆盖 DB：<code>NEXT_PUBLIC_SITE_NAME</code>
                      </>
                    ) : (
                      <>
                        当前为<strong>数据库优先</strong>；环境变量兜底：<code>NEXT_PUBLIC_SITE_NAME</code>
                      </>
                    )
                  ) : (
                    <>
                      环境变量：<code>NEXT_PUBLIC_SITE_NAME</code>
                    </>
                  )}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">网站描述</p>
                <p className="font-medium">{dbSettings?.siteDescription ?? siteDescription}</p>
                <p className="text-xs text-muted-foreground">
                  {dbSettings ? (
                    dbSettings.configPriority === "env_first" ? (
                      <>
                        当前为<strong>环境变量优先</strong>；环境变量覆盖 DB：<code>NEXT_PUBLIC_SITE_DESCRIPTION</code>
                      </>
                    ) : (
                      <>
                        当前为<strong>数据库优先</strong>；环境变量兜底：<code>NEXT_PUBLIC_SITE_DESCRIPTION</code>
                      </>
                    )
                  ) : (
                    <>
                      环境变量：<code>NEXT_PUBLIC_SITE_DESCRIPTION</code>
                    </>
                  )}
                </p>
              </div>
            </div>

            {dbSettings ? (
              <div className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">热更新配置</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    网站图标：<code>{dbSettings.siteIcon}</code>
                  </li>
                  <li>
                    订单过期时间：<code>{dbSettings.orderExpireMinutes}</code> 分钟
                  </li>
                </ul>
                <p className="mt-2">
                  前往{" "}
                  <Link href="/admin/system-config" className="underline underline-offset-4">
                    系统配置
                  </Link>{" "}
                  可直接修改并热生效。
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Payment Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-5 w-5" />
              支付配置
            </CardTitle>
            <CardDescription>
              Linux DO Credit 支付状态
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              {isPaymentConfigured ? (
                <>
                  <CheckCircle className="h-5 w-5 text-emerald-500" />
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    支付已配置
                  </span>
                  <Badge variant="secondary">LDC 支付可用</Badge>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-rose-500" />
                  <span className="font-medium text-rose-600 dark:text-rose-400">
                    支付未配置
                  </span>
                </>
              )}
            </div>
            
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm font-medium mb-2">配置说明</p>
              <p className="text-sm text-muted-foreground mb-3">
                在 .env 文件中添加以下环境变量：
              </p>
              <pre className="text-xs bg-zinc-900 text-zinc-100 p-3 rounded-md overflow-x-auto">
{`# Linux DO Credit 支付配置
LDC_CLIENT_ID=your_client_id
LDC_CLIENT_SECRET=your_client_secret

# 可选：自定义支付网关
LDC_GATEWAY=https://credit.linux.do/epay`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Configuration Guide */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-5 w-5" />
              完整配置参考
            </CardTitle>
            <CardDescription>
              所有可用的环境变量配置
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-muted/50 p-4">
              <pre className="text-xs bg-zinc-900 text-zinc-100 p-3 rounded-md overflow-x-auto">
{`# 数据库
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# NextAuth 认证密钥
AUTH_SECRET=your_auth_secret
AUTH_TRUST_HOST=true

# 管理员后台密码
ADMIN_PASSWORD=your_admin_password

# Linux DO OAuth 登录（用户下单/查单必须）
LINUXDO_CLIENT_ID=your_oauth_client_id
LINUXDO_CLIENT_SECRET=your_oauth_client_secret

# 网站信息
NEXT_PUBLIC_SITE_NAME=LDC Store
NEXT_PUBLIC_SITE_DESCRIPTION=自动发卡系统

# Linux DO Credit 支付
LDC_CLIENT_ID=your_client_id
LDC_CLIENT_SECRET=your_client_secret
LDC_GATEWAY=https://credit.linux.do/epay`}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
