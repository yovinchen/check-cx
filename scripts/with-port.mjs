/**
 * 从 .env / .env.local 读取 PORT，然后启动 next 命令。
 * 用法: node scripts/with-port.mjs dev --turbopack
 *       node scripts/with-port.mjs start
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function loadPort() {
  // 如果已经通过环境变量设置了 PORT，直接使用
  if (process.env.PORT) return process.env.PORT;

  // 依次尝试 .env.local → .env
  for (const name of [".env.local", ".env"]) {
    try {
      const content = readFileSync(resolve(process.cwd(), name), "utf-8");
      const match = content.match(/^PORT\s*=\s*(\d+)/m);
      if (match) return match[1];
    } catch {
      // 文件不存在，继续
    }
  }
  return "3000"; // 默认端口
}

const port = loadPort();
const [subcommand, ...rest] = process.argv.slice(2);

const args = [subcommand, "-p", port, ...rest];

// 找到本地 next CLI
const __dirname = dirname(fileURLToPath(import.meta.url));
const nextBin = resolve(__dirname, "..", "node_modules", ".bin", "next");

console.log(`▶ next ${args.join(" ")}`);

try {
  execFileSync(nextBin, args, {
    stdio: "inherit",
    env: { ...process.env, PORT: port },
  });
} catch (e) {
  process.exit(e.status ?? 1);
}
