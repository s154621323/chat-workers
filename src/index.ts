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

import { createYoga, YogaInitialContext } from '@graphql-yoga/common';
import { makeExecutableSchema } from '@graphql-tools/schema';

// 豆包 API 请求体接口
interface DoubaoApiRequest {
	model: string;
	messages: {
		role: string;
		content: string;
	}[];
	stream?: boolean;
}

// 自定义上下文接口
interface CustomContext {
	request: Request;
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
    # 新增流式输出的 Mutation，返回类型为 String (Stream URL)
    chatStream(message: String!, systemPrompt: String): String
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
		
		// 新增流式输出的 resolver
		chatStream: async (_: any, { message, systemPrompt = '你是人工智能助手.' }: { message: string, systemPrompt?: string }, context: any) => {
			if (!message) {
				throw new Error('消息不能为空');
			}
			
			// 获取请求来源域名，用于设置 stream URL
			const url = new URL(context.request.url);
			const origin = url.origin;
			
			// 生成唯一的流式输出ID
			const streamId = crypto.randomUUID();
			
			// 返回流式输出的URL，前端将使用这个URL进行SSE连接
			return `${origin}/stream/${streamId}?message=${encodeURIComponent(message)}&systemPrompt=${encodeURIComponent(systemPrompt)}`;
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
	},
	// 修改上下文处理方式，使其符合 TypeScript 类型要求
	context: async ({ request }) => {
		// 这里可以添加其他上下文处理逻辑
		return { request } as unknown as ExecutionContext;
	}
});

/**
 * 处理流式输出请求
 * @param request 请求对象
 * @returns 返回 SSE 流
 */
async function handleStreamRequest(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const message = url.searchParams.get('message');
	const systemPrompt = url.searchParams.get('systemPrompt') || '你是人工智能助手.';
	
	if (!message) {
		return new Response('消息参数不能为空', { status: 400 });
	}
	
	// 构建豆包 API 请求体（启用流式输出）
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
		],
		stream: true // 启用流式输出
	};
	
	// 调用豆包 API，启用流式输出
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
		return new Response(`豆包 API 调用失败: ${errorText}`, { status: response.status });
	}
	
	// 确保响应是可读流
	const responseBody = response.body;
	if (!responseBody) {
		return new Response('无法获取响应流', { status: 500 });
	}
	
	// 构建 Server-Sent Events 响应
	const { readable, writable } = new TransformStream();
	const writer = writable.getWriter();
	const encoder = new TextEncoder();
	
	// 处理豆包 API 的流式响应
	const reader = responseBody.getReader();
	const decoder = new TextDecoder();
	
	// 异步处理流式响应
	(async () => {
		try {
			writer.write(encoder.encode("event: start\ndata: 连接已建立\n\n"));
			
			// 读取流式响应
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				
				// 解码二进制数据为文本
				const chunk = decoder.decode(value, { stream: true });
				
				// 处理 SSE 格式的数据
				const lines = chunk.split('\n');
				for (const line of lines) {
					if (line.startsWith('data:')) {
						try {
							// 去除 'data: ' 前缀，解析 JSON
							const jsonStr = line.slice(5).trim();
							if (jsonStr === '[DONE]') {
								// 流结束标记
								writer.write(encoder.encode("event: done\ndata: 流式响应完成\n\n"));
								continue;
							}
							
							// 解析 JSON 数据
							const data = JSON.parse(jsonStr);
							const content = data.choices?.[0]?.delta?.content || '';
							
							// 将内容发送到客户端
							if (content) {
								writer.write(encoder.encode(`event: message\ndata: ${JSON.stringify({ content })}\n\n`));
							}
						} catch (e: any) {
							console.error('解析 SSE 数据出错:', e);
						}
					}
				}
			}
		} catch (error: any) {
			// 发送错误事件
			writer.write(encoder.encode(`event: error\ndata: ${error.message}\n\n`));
		} finally {
			// 关闭流
			writer.close();
		}
	})();
	
	// 返回 SSE 响应
	return new Response(readable, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'Access-Control-Allow-Origin': '*',
		}
	});
}

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
		
		// 处理流式输出请求
		if (url.pathname.startsWith('/stream/')) {
			return handleStreamRequest(request);
		}
		
		// 处理 GraphQL 请求
		return yoga.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
