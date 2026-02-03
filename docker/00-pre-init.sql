-- 创建 Supabase schema.sql 中引用的角色（标准 PG 中不存在）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END
$$;

-- 授予 anon 角色对 public schema 的访问权限
GRANT USAGE ON SCHEMA public TO anon;
