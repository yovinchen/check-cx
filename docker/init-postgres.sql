-- =============================================================================
-- PostgreSQL 初始化脚本（Docker 环境）
--
-- schema.sql 会先执行，创建表/视图/函数
-- 本文件处理 RLS 禁用（标准 PG 不需要）和示例数据
-- =============================================================================

-- 禁用 RLS（标准 PostgreSQL 部署不需要行级安全）
ALTER TABLE public.check_configs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_info DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_poller_leases DISABLE ROW LEVEL SECURITY;

-- 删除 Supabase 专用的 RLS 策略（如果存在）
DROP POLICY IF EXISTS allow_anon_select_history ON public.check_history;
DROP POLICY IF EXISTS allow_public_read_group_info ON public.group_info;
DROP POLICY IF EXISTS allow_public_read_notifications ON public.system_notifications;

-- =============================================================================
-- 示例数据（可选，取消注释即可启用）
-- =============================================================================

-- INSERT INTO public.check_configs (name, type, model, endpoint, api_key, enabled, group_name)
-- VALUES
--   ('OpenAI GPT-4o-mini', 'openai', 'gpt-4o-mini',
--    'https://api.openai.com/v1/chat/completions',
--    'sk-your-openai-key', true, 'OpenAI'),
--
--   ('Claude 3.5 Sonnet', 'anthropic', 'claude-3-5-sonnet-20241022',
--    'https://api.anthropic.com/v1/messages',
--    'sk-ant-your-anthropic-key', true, 'Anthropic'),
--
--   ('Gemini 2.0 Flash', 'gemini', 'gemini-2.0-flash',
--    'https://generativelanguage.googleapis.com/v1beta/models',
--    'your-gemini-key', true, 'Google');

-- INSERT INTO public.system_notifications (message, level, is_active)
-- VALUES ('Check CX 已启动，欢迎使用！', 'info', true);
