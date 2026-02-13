import { Hono } from 'hono';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import crypto from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import z from 'zod';

const app = new Hono();

const proxyToken = Deno.env.get('PROXY_TOKEN');
const proxyUrlTemplate = Deno.env.get('PROXY_URL');

if (!proxyToken) {
	console.error('failed to find PROXY_TOKEN environment variable');
	Deno.exit(1);
}

if (!proxyUrlTemplate) {
	console.error('failed to find PROXY_URL environment variable');
	Deno.exit(1);
}

function timingSafeEquals(a: string, b: string) {
	const aBuf = new TextEncoder().encode(a);
	const bBuf = new TextEncoder().encode(b);

	if (aBuf.length !== bBuf.length) {
		return false;
	}

	return crypto.timingSafeEqual(aBuf, bBuf);
}

app.post(
	'/proxy',
	zValidator(
		'json',
		z.object({
			method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']),
			url: z.url(),
			headers: z.record(z.string(), z.string()),
			body: z.string().nullable(),
			sessionId: z.string()
		})
	),
	async (c) => {
		const header = c.req.header('x-proxy-token');
		if (!header || !timingSafeEquals(proxyToken, header)) {
			return c.json(
				{
					code: 20017,
					message: "The Maze isn't meant for you 👽👽👽"
				},
				403
			);
		}

		const body = c.req.valid('json');

		const client = Deno.createHttpClient({
			proxy: {
				url: proxyUrlTemplate.replaceAll('{sessionId}', body.sessionId)
			}
		});
		console.log(proxyUrlTemplate.replaceAll('{sessionId}', body.sessionId));
		const res = await fetch(body.url, {
			method: body.method,
			headers: {
				...body.headers
			},
			body: body.body,
			client
		});

		const resBody = await res.arrayBuffer();
		const resHeaders: Record<string, string> = {};
		for (const [key, value] of res.headers.entries()) {
			resHeaders[key] = value;
		}

		return c.body(resBody, res.status as ContentfulStatusCode, resHeaders);
	}
);

export default app;
