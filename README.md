# Chat Workers

这是一个基于 Cloudflare Workers 的聊天应用项目。

## 开发说明

- 运行 `npm run dev` 启动开发服务器
- 在浏览器中访问 http://localhost:8787/ 查看应用
- 运行 `npm run deploy` 发布到 Cloudflare Workers

## 项目结构

- `src/index.ts` - Workers 入口文件
- `wrangler.jsonc` - Cloudflare Workers 配置文件

## 技术栈

- Cloudflare Workers
- TypeScript 