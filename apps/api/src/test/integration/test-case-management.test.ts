import { adminSecretsStore, env, SELF } from 'cloudflare:test'
import { sign } from 'hono/jwt'
import { beforeAll, expect, it } from 'vitest'

import { SCHEMA_DDL as ACCOUNT_SCHEMA_DDL } from '@repo/domain/src/accounts-db'

import migration from '../../../migrations/0035_test_case_management.sql?raw'

const ROOT = 'https://api.recflare.net/api/testcasemanagement/v1'
beforeAll(async () => {
	await adminSecretsStore(env.JWT_SECRET).create('tcm-test-key')
	for (const sql of ACCOUNT_SCHEMA_DDL) await env.DB.prepare(sql).run()
	await env.DB.prepare('INSERT INTO account (data) VALUES (?)')
		.bind(JSON.stringify({ accountId: 42, username: 'Tester', displayName: 'Test Developer' }))
		.run()
	for (const sql of migration
		.split(';')
		.map((s) => s.trim())
		.filter(Boolean))
		await env.DB.prepare(sql).run()
	await env.DB.prepare(
		"INSERT INTO tcm_plan (id,name,description) VALUES (1,'Test plan','Synthetic test plan')"
	).run()
	await env.DB.prepare(
		"INSERT INTO tcm_pass (id,plan_id,name,description) VALUES (1,1,'Test run','Synthetic test run')"
	).run()
	for (let id = 1; id <= 6; id++)
		await env.DB.prepare('INSERT INTO tcm_case (id,pass_id,title,description) VALUES (?,1,?,?)')
			.bind(`TEST-${id}`, `Case ${id}`, 'Synthetic test case')
			.run()
})

async function headers(developer = true, sub = '42') {
	return {
		Authorization: `Bearer ${await sign({ sub, role: developer ? ['developer'] : ['gameClient'], exp: Math.floor(Date.now() / 1000) + 3600 }, 'tcm-test-key', 'HS256')}`,
		'content-type': 'application/json',
	}
}
it('requires developer authentication for lists and mutations', async () => {
	expect((await SELF.fetch(`${ROOT}/testplans`)).status).toBe(401)
	expect((await SELF.fetch(`${ROOT}/testplans`, { headers: await headers(false) })).status).toBe(
		403
	)
	expect(
		(
			await SELF.fetch(`${ROOT}/testcase/TEST-1/status`, {
				method: 'POST',
				headers: await headers(false),
				body: '3',
			})
		).status
	).toBe(403)
})
it('loads seeded plans, runs and untested cases in client DTO shapes', async () => {
	const current = await SELF.fetch(`${ROOT}/testpass/0`, { headers: await headers() })
	expect(await current.json()).toEqual(expect.objectContaining({ Id: 1, NumTestCases: 6 }))
	const plans = await SELF.fetch(`${ROOT}/testplans`, { headers: await headers() })
	expect(await plans.json()).toEqual([
		expect.objectContaining({ Id: 1, NumUntestedTestCases: 6, NumPassedTestCases: 0 }),
	])
	const runs = await SELF.fetch(`${ROOT}/testpasssummary`, { headers: await headers() })
	expect(await runs.json()).toEqual([
		expect.objectContaining({
			Id: 1,
			TestPlanId: 1,
			NumTestCases: 6,
			TestCases: expect.arrayContaining([
				expect.objectContaining({
					Id: 'TEST-1',
					Status: 0,
					Comments: [],
					AssignedPlayerNames: [],
				}),
			]),
		}),
	])
})
it('persists claims, statuses and comments and recomputes counts', async () => {
	const call = async (action: string, body?: unknown, sub = '42') =>
		SELF.fetch(`${ROOT}/testcase/TEST-1/${action}`, {
			method: 'POST',
			headers: await headers(true, sub),
			body: body === undefined ? undefined : JSON.stringify(body),
		})
	expect((await call('claim')).status).toBe(200)
	expect((await call('claim', undefined, '43')).status).toBe(409)
	expect((await call('unclaim', undefined, '43')).status).toBe(409)
	expect((await call('status', 3)).status).toBe(200)
	expect((await call('comment', 'Verified login')).status).toBe(200)
	expect((await call('status', 99)).status).toBe(400)
	const detail = await SELF.fetch(`${ROOT}/testcase/TEST-1`, { headers: await headers() })
	expect(await detail.json()).toEqual(
		expect.objectContaining({
			Status: 3,
			AssignedPlayerNames: ['_Tester'],
			Comments: [expect.objectContaining({ Comment: 'Verified login' })],
		})
	)
	const plans = await SELF.fetch(`${ROOT}/testplans`, { headers: await headers() })
	expect(await plans.json()).toEqual([
		expect.objectContaining({ NumPassedTestCases: 1, NumUntestedTestCases: 5 }),
	])
})
