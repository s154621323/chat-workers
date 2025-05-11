/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { createYoga } from '@graphql-yoga/common';
import { makeExecutableSchema } from '@graphql-tools/schema';

// 豆包 API 请求体接口
interface DoubaoApiRequest {
	model: string;
	messages: {
		role: string;
		content: string;
	}[];
}

// 定义 GraphQL Schema
const typeDefs = `
  type Query {
    hello: String!
  }

  type ChatResponse {
    id: String
    object: String
    created: Int
    model: String
    choices: [Choice]
    usage: Usage
  }

  type Choice {
    index: Int
    message: Message
    finish_reason: String
  }

  type Message {
    role: String
    content: String
  }

  type Usage {
    prompt_tokens: Int
    completion_tokens: Int
    total_tokens: Int
  }

  type Mutation {
    chat(message: String!, systemPrompt: String): ChatResponse
  }
`;

// 定义 resolvers
const resolvers = {
	Query: {
		hello: () => '欢迎使用 Chat Workers GraphQL API！',
	},
	Mutation: {
		chat: async (_: any, { message, systemPrompt = '你是人工智能助手.' }: { message: string, systemPrompt?: string }) => {
			if (!message) {
				throw new Error('消息不能为空');
			}

			// 构建豆包 API 请求体
			const doubaoApiRequest: DoubaoApiRequest = {
				model: 'doubao-1-5-pro-32k-250115',
				messages: [
					{
						role: 'system',
						content: systemPrompt
					},
					{
						role: 'user',
						content: message
					}
				]
			};

			// 调用豆包 API
			const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': 'Bearer 6fb989fa-8001-4d59-9d73-280ceae52311'
				},
				body: JSON.stringify(doubaoApiRequest)
			});

			// 检查响应状态
			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`豆包 API 调用失败: ${errorText}`);
			}

			// 返回豆包 API 的响应
			return await response.json();
		},
	},
};

// 创建 schema
const schema = makeExecutableSchema({
	typeDefs,
	resolvers,
});

// 创建 GraphQL Yoga 实例
const yoga = createYoga<Env, ExecutionContext>({
	schema,
	graphqlEndpoint: '/graphql',
	landingPage: false,
	cors: {
		origin: '*',
		methods: ['POST', 'GET', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization'],
	}
});

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// 处理 GraphQL 请求
		const url = new URL(request.url);
		
		// 如果是根路径请求，返回欢迎信息
		if (url.pathname === '/') {
			return new Response('欢迎使用 Chat Workers GraphQL API！\n请访问 /graphql 端点使用 GraphQL 接口。', {
				headers: {
					'Content-Type': 'text/plain;charset=UTF-8',
				},
			});
		}
		
		// 处理 GraphQL 请求
		return yoga.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
