import { Hono } from 'hono'

import { getAccount } from '@repo/domain'

import { authedId, authedRoles, unauthorized } from '../http'

import type { App } from '../context'

type CaseRow = {
	id: string
	pass_id: number
	title: string
	description: string
	room_name: string
	status: number
	assigned_account_id: number | null
}
type PassRow = {
	id: number
	plan_id: number
	name: string
	description: string
	start_date: string
	end_date: string | null
	manually_closed: number
}
const ROOT = '/api/testcasemanagement/v1'
export const testCaseManagementRoutes = new Hono<App>()

testCaseManagementRoutes.use(`${ROOT}/*`, async (c, next) => {
	if ((await authedId(c)) === null) return unauthorized(c)
	if (!(await authedRoles(c))?.includes('developer')) return c.body(null, 403)
	await next()
})
async function caseDto(db: D1Database, row: CaseRow, domain: string) {
	const assigned =
		row.assigned_account_id === null ? null : await getAccount(db, row.assigned_account_id)
	const comments = await db
		.prepare(
			'SELECT created_at AS CreatedAt, comment AS Comment FROM tcm_comment WHERE case_id = ? ORDER BY id'
		)
		.bind(row.id)
		.all()
	return {
		Id: row.id,
		Key: row.id,
		Title: row.title,
		Description: row.description,
		RoomName: row.room_name,
		Status: row.status,
		// The 2026 To-Do/ownership predicate concatenates '_' + Account.Username.
		// Display names do not satisfy that predicate (298E850 / 299E1A0).
		AssignedPlayerNames: assigned ? [`_${assigned.username}`] : [],
		Tags: [],
		JiraUrl: `https://${domain}/testcases/${encodeURIComponent(row.id)}`,
		Comments: comments.results,
	}
}
async function passDto(db: D1Database, row: PassRow, domain: string) {
	const rows = await db
		.prepare('SELECT * FROM tcm_case WHERE pass_id = ? ORDER BY id')
		.bind(row.id)
		.all<CaseRow>()
	return {
		Id: row.id,
		TestPlanId: row.plan_id,
		Name: row.name,
		Description: row.description,
		StartDate: row.start_date,
		EndDate: row.end_date,
		WasManuallyClosed: Boolean(row.manually_closed),
		TestCases: await Promise.all(rows.results.map((r) => caseDto(db, r, domain))),
		Tags: [],
		NumTestCases: rows.results.length,
		NumPassedTestCases: rows.results.filter((r) => r.status === 3).length,
		NumFailedTestCases: rows.results.filter((r) => r.status === 2).length,
	}
}
testCaseManagementRoutes.get(`${ROOT}/testplans`, async (c) => {
	const plans = await c.env.DB.prepare('SELECT * FROM tcm_plan ORDER BY id DESC').all<{
		id: number
		name: string
		description: string
		created_at: string
	}>()
	return c.json(
		await Promise.all(
			plans.results.map(async (plan) => {
				const cases = await c.env.DB.prepare(
					'SELECT c.status FROM tcm_case c JOIN tcm_pass p ON p.id = c.pass_id WHERE p.plan_id = ?'
				)
					.bind(plan.id)
					.all<{ status: number }>()
				const count = (status: number) => cases.results.filter((r) => r.status === status).length
				return {
					Id: plan.id,
					Name: plan.name,
					Description: plan.description,
					CreatedOnDate: plan.created_at,
					NumPassedTestCases: count(3),
					NumBlockedTestCases: count(4),
					NumUntestedTestCases: count(0),
					NumRetestTestCases: count(1),
					NumFailedTestCases: count(2),
				}
			})
		)
	)
})
testCaseManagementRoutes.get(`${ROOT}/testpasssummary`, async (c) => {
	const rows = await c.env.DB.prepare('SELECT * FROM tcm_pass ORDER BY id DESC').all<PassRow>()
	return c.json(await Promise.all(rows.results.map((r) => passDto(c.env.DB, r, c.env.DOMAIN))))
})
testCaseManagementRoutes.get(`${ROOT}/testpass/:id`, async (c) => {
	// The live 2026 result-refresh path requests run 0 after updating a case.
	// Resolve that sentinel to the latest open test run, with its real id.
	const row =
		c.req.param('id') === '0'
			? await c.env.DB.prepare(
					'SELECT * FROM tcm_pass WHERE end_date IS NULL AND manually_closed = 0 ORDER BY id DESC LIMIT 1'
				).first<PassRow>()
			: await c.env.DB.prepare('SELECT * FROM tcm_pass WHERE id = ?')
					.bind(c.req.param('id'))
					.first<PassRow>()
	return row ? c.json(await passDto(c.env.DB, row, c.env.DOMAIN)) : c.body(null, 404)
})
testCaseManagementRoutes.get(`${ROOT}/testcase/:id`, async (c) => {
	const row = await c.env.DB.prepare('SELECT * FROM tcm_case WHERE id = ?')
		.bind(c.req.param('id'))
		.first<CaseRow>()
	return row ? c.json(await caseDto(c.env.DB, row, c.env.DOMAIN)) : c.body(null, 404)
})
testCaseManagementRoutes.post(`${ROOT}/testcase/:id/:action`, async (c) => {
	const id = c.req.param('id'),
		action = c.req.param('action'),
		accountId = (await authedId(c))!
	const row = await c.env.DB.prepare('SELECT * FROM tcm_case WHERE id = ?')
		.bind(id)
		.first<CaseRow>()
	if (!row) return c.body(null, 404)
	if (action === 'claim') {
		const result = await c.env.DB.prepare(
			'UPDATE tcm_case SET assigned_account_id = ?, status = 1 WHERE id = ? AND (assigned_account_id IS NULL OR assigned_account_id = ?)'
		)
			.bind(accountId, id, accountId)
			.run()
		if (!result.meta.changes) return c.body(null, 409)
	} else if (action === 'unclaim') {
		const result = await c.env.DB.prepare(
			'UPDATE tcm_case SET assigned_account_id = NULL, status = CASE WHEN status = 1 THEN 0 ELSE status END WHERE id = ? AND assigned_account_id = ?'
		)
			.bind(id, accountId)
			.run()
		if (!result.meta.changes) return c.body(null, 409)
	} else if (action === 'status' || action === 'comment') {
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return c.body(null, 400)
		}
		if (action === 'status') {
			if (typeof body !== 'number' || !Number.isInteger(body) || body < 0 || body > 4)
				return c.body(null, 400)
			await c.env.DB.prepare('UPDATE tcm_case SET status = ? WHERE id = ?').bind(body, id).run()
		} else {
			if (typeof body !== 'string' || !body.trim() || body.length > 16000) return c.body(null, 400)
			await c.env.DB.prepare(
				'INSERT INTO tcm_comment (case_id, account_id, comment) VALUES (?, ?, ?)'
			)
				.bind(id, accountId, body)
				.run()
		}
	} else return c.body(null, 404)
	return c.body(null, 200)
})
