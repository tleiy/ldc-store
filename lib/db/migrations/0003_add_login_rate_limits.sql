-- 登录限流表：用于防止管理员密码暴力破解
-- identifier 一般为客户端 IP（或更细粒度的标识符）

CREATE TABLE IF NOT EXISTS "login_rate_limits" (
	"identifier" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"first_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_until" timestamp with time zone
);

