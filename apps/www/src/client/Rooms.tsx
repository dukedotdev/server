import { useEffect, useState } from 'react'

import { call, usernamesFor, where } from './api'

import type { MouseEvent } from 'react'
import type { PublicAccount } from './api'

/**
 * The public hot rooms page, at `/rooms`: the same "hot" list the game's room browser opens
 * on, as a grid of tiles like `/events`.
 *
 * Read from `rooms`' `GET /rooms/hot` — public, non-dorm rooms not excluded from lists,
 * busiest right now first, then by engagement. That endpoint does the filtering and the
 * ranking; this page only draws the first page of it. The creators' names come from one
 * `accounts` bulk lookup and are decoration: if it fails the tiles just go without.
 */

/** How many rooms the page asks for. One page of the feed, the size of the events grid. */
const ROOM_COUNT = 50

/** The few room fields a tile shows. */
interface HotRoom {
	RoomId: number
	Name: string
	Description: string
	ImageName: string
	CreatorAccountId: number
	Stats: { VisitCount: number; CheerCount: number; FavoriteCount: number }
}

async function fetchHotRooms(): Promise<HotRoom[]> {
	const page = await call<{ Results?: HotRoom[] }>(`${where().rooms}/rooms/hot?take=${ROOM_COUNT}`)
	return Array.isArray(page.Results) ? page.Results : []
}

export function RoomsPage({
	ready,
	navigate,
}: {
	/** Whether `/api/config` has landed — every fetch here goes through `where()`. */
	ready: boolean
	navigate: (to: string) => void
}) {
	const [rooms, setRooms] = useState<HotRoom[] | null>(null)
	const [creators, setCreators] = useState<Map<number, PublicAccount>>(new Map())
	const [error, setError] = useState('')

	useEffect(() => {
		if (!ready) return
		let cancelled = false
		void fetchHotRooms()
			.then(async (list) => {
				if (cancelled) return
				setRooms(list)
				const names = await usernamesFor(list.map((r) => r.CreatorAccountId))
				if (!cancelled) setCreators(names)
			})
			.catch((e) => {
				if (!cancelled) setError(e instanceof Error ? e.message : String(e))
			})
		return () => {
			cancelled = true
		}
	}, [ready])

	return (
		<main className="shell home listing-page">
			<div className="listing-head">
				<h1>Hot rooms</h1>
				<p className="muted">The busiest rooms right now.</p>
			</div>
			{error ? (
				<p className="error">{error}</p>
			) : rooms === null ? (
				<p className="muted">Loading…</p>
			) : rooms.length === 0 ? (
				<p className="muted">No rooms to show yet.</p>
			) : (
				<ul className="tile-grid">
					{rooms.map((room) => (
						<RoomTile
							key={room.RoomId}
							room={room}
							creator={creators.get(room.CreatorAccountId)}
							navigate={navigate}
						/>
					))}
				</ul>
			)}
		</main>
	)
}

function RoomTile({
	room,
	creator,
	navigate,
}: {
	room: HotRoom
	creator: PublicAccount | undefined
	navigate: (to: string) => void
}) {
	const to = `/rooms/${room.RoomId}`
	const go = (e: MouseEvent) => {
		e.preventDefault()
		navigate(to)
	}

	return (
		<li className="tile">
			{/* The same link as the title, kept out of the tab order and away from screen
			    readers so the tile isn't announced as two links to one place. */}
			<a className="tile-thumb-link" href={to} tabIndex={-1} aria-hidden="true" onClick={go}>
				<img
					className="tile-thumb"
					src={`${where().img}/${room.ImageName}?width=512`}
					alt=""
					loading="lazy"
				/>
			</a>
			<div className="tile-body">
				<h2 className="tile-name">
					{/* The caret is how the game writes a room name. */}
					<a href={to} onClick={go}>
						^{room.Name}
					</a>
				</h2>
				{creator && (
					<a
						className="tile-sub"
						href={`/user/${encodeURIComponent(creator.username)}`}
						onClick={(e) => {
							e.preventDefault()
							navigate(`/user/${encodeURIComponent(creator.username)}`)
						}}
					>
						by {creator.displayName || creator.username}
					</a>
				)}
				{room.Description && <p className="tile-desc">{room.Description}</p>}
				<p className="tile-stats">
					{room.Stats.VisitCount.toLocaleString()} visit{room.Stats.VisitCount === 1 ? '' : 's'} ·{' '}
					{room.Stats.CheerCount.toLocaleString()} cheer{room.Stats.CheerCount === 1 ? '' : 's'}
				</p>
			</div>
		</li>
	)
}
