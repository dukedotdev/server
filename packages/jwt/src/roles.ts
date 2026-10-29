/**
 * The token roles that make an account STAFF: what every staff-only surface admits — the
 * moderation panel and its endpoints, the coach/system broadcasts, the takedowns of someone
 * else's photo, invention or room — and what `auth` audits a sign-in for.
 *
 * In a file of its own, with nothing imported, so the website's browser bundle can use it
 * (as `@repo/jwt/src/roles`) without pulling in the token signing code.
 */
export const STAFF_ROLES = ['developer', 'moderator'] as const

export type StaffRole = (typeof STAFF_ROLES)[number]

/** Whether a token's `role` claim includes a staff role. False for none (no token). */
export function isStaff(roles: readonly string[] | null | undefined): boolean {
	return roles?.some((role) => (STAFF_ROLES as readonly string[]).includes(role)) ?? false
}
