/**
 * 0002_competition — imports, rounds, prerequisites and club entries, tested as
 * SQL with Row Level Security in force. All athlete data here is synthetic.
 */

import { beforeAll, describe, expect, it } from "vitest"
import { assignCategory } from "@/lib/competition/rules/age-category"
import { planRounds } from "@/lib/competition/rounds"
import type { CategoryId, Championship, RaceCode } from "@/lib/competition/rules/types"
import { generateStartList, type StartList } from "@/lib/competition/start-list"
import { SEASON_2026_2027 } from "@/lib/competition/rules/rulesets/season-2026-2027"
import { as, createTestDb, makeClubAdmin, makeFederationAdmin, refusal, type Db, type Tx } from "./harness"

let db: Db
let admin: string
let sscAdmin: string
let zscAdmin: string

const sha = (n: number) => n.toString(16).padStart(64, "0")

function athleteRow(n: number, club: string, birthYear: number | null, extra: Record<string, unknown> = {}) {
  return {
    sheet: "Database",
    row_number: n,
    status: "accepted",
    data: {
      federation_number: n,
      registration_number: `2/${n}`,
      full_name_ar: `لاعب تجريبي ${n}`,
      name_normalised: `لاعب تجريبي ${n}`,
      birth_year: birthYear,
      gender: n % 2 ? "M" : "F",
      club_code: club,
      ...extra,
    },
    raw: { n },
    issues: [],
  }
}

async function importAthletes(rows: unknown[], fileSha: string): Promise<string> {
  return as(db, admin, async (tx) => {
    const { rows: r } = await tx.query<{ id: string }>(
      "select public.create_import_batch('athletes', '2026-2027', 'synthetic.xlsx', $1, '{}'::jsonb, $2) as id",
      [fileSha, JSON.stringify(rows)]
    )
    await tx.query("select public.commit_import_batch($1)", [r[0]!.id])
    return r[0]!.id
  })
}

async function athleteId(n: number): Promise<string> {
  const { rows } = await db.query<{ id: string }>("select id from public.athletes where federation_number = $1", [n])
  return rows[0]!.id
}

async function newEvent(championship = "qualifications"): Promise<string> {
  return as(db, admin, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "select public.create_event('2026-2027', $1::public.championship, 'جولة تجريبية', 'مدرسة بن مسعود', '2026-11-20') as id",
      [championship]
    )
    return rows[0]!.id
  })
}

const ALL = SEASON_2026_2027.categories.map((c) => c.id)

async function addRound(
  event: string,
  opts: { catalogue?: number; race?: string; key?: string; mode?: "registration" | "advancement"; categories?: string[]; prereqs?: string[] } = {}
): Promise<string> {
  return as(db, admin, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `select public.add_competition_round($1, $2, $3, $4, $5, $6::public.entry_mode, $7::text[], '2026-2027.r1', $8::uuid[]) as id`,
      [
        event,
        opts.catalogue ?? 1,
        opts.race ?? "200m",
        opts.key ?? "qualification",
        "جولة التصفيات",
        opts.mode ?? "registration",
        opts.categories ?? ALL,
        opts.prereqs ?? [],
      ]
    )
    return rows[0]!.id
  })
}

async function openRound(round: string): Promise<void> {
  await as(db, admin, async (tx) => {
    await tx.query("select public.set_round_schedule($1, now() + interval '7 days')", [round])
    await tx.query("select public.set_round_status($1, 'registration_open')", [round])
  })
}

/** Builds the start list with the real generator from the round's entries, as the website does. */
async function startListFor(round: string): Promise<StartList> {
  const { rows } = await db.query<{
    athlete_id: string; federation_number: number; full_name_ar: string; gender: "M" | "F"; category_id: CategoryId
    code: string; name_ar: string; race_code: RaceCode; round_key: string; championship: Championship
  }>(
    `select e.athlete_id, a.federation_number, a.full_name_ar, a.gender, e.category_id, c.code, c.name_ar,
            cr.race_code, cr.round_key, ev.championship
     from public.race_entries e join public.athletes a on a.id = e.athlete_id join public.clubs c on c.id = e.club_id
     join public.competition_rounds cr on cr.id = e.round_id join public.events ev on ev.id = cr.event_id
     where e.round_id = $1 and e.status = 'active'`,
    [round]
  )
  return generateStartList({
    championship: rows[0]!.championship,
    race: rows[0]!.race_code,
    roundKey: rows[0]!.round_key,
    entrants: rows.map((r) => ({
      athleteId: r.athlete_id, federationNumber: r.federation_number, fullName: r.full_name_ar,
      clubCode: r.code, clubName: r.name_ar, categoryId: r.category_id, gender: r.gender,
    })),
    rankings: new Map(),
    ruleset: SEASON_2026_2027,
  })
}

// The list is built BEFORE the transaction opens: PGlite has one connection.
async function publishStartList(round: string, list?: unknown) {
  const payload = JSON.stringify(list ?? (await startListFor(round)))
  return as(db, admin, (tx) => tx.query("select public.publish_start_list($1, $2::jsonb)", [round, payload]))
}

const submit = (user: string, round: string, athletes: string[]) =>
  as(db, user, (tx: Tx) => tx.query("select public.submit_race_entries($1, $2::uuid[])", [round, athletes]))

beforeAll(async () => {
  db = await createTestDb()
  admin = await makeFederationAdmin(db)
  sscAdmin = await makeClubAdmin(db, "SSC")
  zscAdmin = await makeClubAdmin(db, "ZSC")
  await importAthletes(
    [
      athleteRow(101, "SSC", 2014), // تحت 13
      athleteRow(102, "SSC", 2001), // عمومي
      athleteRow(103, "SSC", null), // no birth year (Q14)
      athleteRow(201, "ZSC", 2014),
    ],
    sha(1)
  )
})

describe("season categories match the rules engine", () => {
  it("category_for agrees with assignCategory for every birth year 1950-2026", async () => {
    const { rows } = await db.query<{ y: number; c: string | null }>(
      "select y, public.category_for((select id from public.seasons where code = '2026-2027'), y) as c from generate_series(1950, 2026) y"
    )
    for (const { y, c } of rows) {
      const a = assignCategory(y, SEASON_2026_2027)
      expect(c, `birth year ${y}`).toBe(a.resolved ? a.category.id : null)
    }
  })
})

describe("import", () => {
  it("commits athletes and their current club", async () => {
    const { rows } = await db.query<{ n: number; code: string }>(
      `select a.federation_number as n, c.code from public.athletes a
       join public.club_memberships m on m.athlete_id = a.id and m.valid_to is null
       join public.clubs c on c.id = m.club_id order by 1`
    )
    expect(rows).toEqual([
      { n: 101, code: "SSC" },
      { n: 102, code: "SSC" },
      { n: 103, code: "SSC" },
      { n: 201, code: "ZSC" },
    ])
  })

  it("refuses the same file twice, by content hash", async () => {
    const msg = await refusal(importAthletes([athleteRow(999, "SSC", 2010)], sha(1)))
    expect(msg).toMatch(/already imported/)
    const { rows } = await db.query("select 1 from public.athletes where federation_number = 999")
    expect(rows).toHaveLength(0)
  })

  it("a corrected file updates by federation number instead of duplicating, and records a transfer", async () => {
    await importAthletes([athleteRow(300, "SSC", 2012)], sha(2))
    await importAthletes([athleteRow(300, "ZSC", 2012, { full_name_ar: "اسم مصحح" })], sha(3))
    const a = await db.query<{ n: number }>("select count(*)::int as n from public.athletes where federation_number = 300")
    expect(a.rows[0]!.n).toBe(1)
    const m = await db.query<{ code: string; closed: boolean }>(
      `select c.code, m.valid_to is not null as closed from public.club_memberships m
       join public.clubs c on c.id = m.club_id where m.athlete_id = $1 order by m.created_at`,
      [await athleteId(300)]
    )
    expect(m.rows).toEqual([
      { code: "SSC", closed: true },
      { code: "ZSC", closed: false },
    ])
    const audit = await db.query("select 1 from public.audit_log where action = 'athlete.update_from_import'")
    expect(audit.rows.length).toBeGreaterThan(0)
  })

  it("never commits rejected or suspected-duplicate rows", async () => {
    await importAthletes(
      [
        { ...athleteRow(400, "SSC", 2010), status: "rejected" },
        { ...athleteRow(401, "SSC", 2010), status: "suspected_duplicate" },
        { ...athleteRow(402, "SSC", 2010), status: "warning" },
      ],
      sha(4)
    )
    const { rows } = await db.query<{ n: number }>(
      "select federation_number as n from public.athletes where federation_number between 400 and 402"
    )
    expect(rows.map((r) => r.n)).toEqual([402])
  })

  it("rolls back the whole batch when one row fails", async () => {
    const msg = await refusal(importAthletes([athleteRow(500, "SSC", 2010), athleteRow(501, "NOPE", 2010)], sha(5)))
    expect(msg).toMatch(/not registered/)
    const { rows } = await db.query("select 1 from public.athletes where federation_number = 500")
    expect(rows).toHaveLength(0)
  })

  it("is federation-admin only, and clubs cannot read import data", async () => {
    const msg = await refusal(
      as(db, sscAdmin, (tx) =>
        tx.query("select public.create_import_batch('athletes', '2026-2027', 'x.xlsx', $1, '{}'::jsonb, '[]'::jsonb)", [sha(6)])
      )
    )
    expect(msg).toMatch(/federation admin/)
    const { rows } = await as(db, sscAdmin, (tx) => tx.query("select * from public.import_rows"))
    expect(rows).toHaveLength(0)
  })
})

describe("club data isolation", () => {
  it("a club sees only its own athletes", async () => {
    const { rows } = await as(db, sscAdmin, (tx) =>
      tx.query<{ n: number }>("select federation_number as n from public.athletes order by 1")
    )
    expect(rows.map((r) => r.n)).toEqual([101, 102, 103, 402])
  })

  it("anon sees no athletes", async () => {
    const { rows } = await as(db, null, (tx) => tx.query("select * from public.athletes"))
    expect(rows).toHaveLength(0)
  })

  it("a club cannot write athletes or entries directly", async () => {
    await refusal(
      as(db, sscAdmin, (tx) =>
        tx.query("insert into public.athletes (federation_number, full_name_ar, name_normalised, gender) values (9000, 'x', 'x', 'M')")
      )
    )
    await as(db, sscAdmin, (tx) => tx.query("update public.athletes set full_name_ar = 'changed'"))
    const { rows } = await db.query("select 1 from public.athletes where full_name_ar = 'changed'")
    expect(rows).toHaveLength(0)
  })
})

describe("round prerequisites", () => {
  it("a later round cannot start until its prerequisite has approved results, and the message names it", async () => {
    const qEvent = await newEvent("qualifications")
    const q = await addRound(qEvent, { race: "100m", catalogue: 4 })
    const lEvent = await newEvent("national_league")
    const r16 = await addRound(lEvent, { race: "100m", catalogue: 8, key: "r16", mode: "advancement", categories: [], prereqs: [q] })

    const msg = await refusal(as(db, admin, (tx) => tx.query("select public.set_round_status($1, 'registration_closed')", [r16])))
    expect(msg).toMatch(/prerequisite rounds have approved results/)
    expect(msg).toMatch(/100m/)

    await openRound(q)
    await submit(sscAdmin, q, [await athleteId(101)])
    await as(db, admin, (tx) => tx.query("select public.set_round_status($1, 'registration_closed')", [q]))
    await publishStartList(q)
    // A plain status change can no longer mark a round completed (0006).
    expect(await refusal(as(db, admin, (tx) => tx.query("select public.set_round_status($1, 'results_submitted')", [q])))).toMatch(
      /results screen/
    )
    const lines = JSON.stringify([{ athlete_id: await athleteId(101), status: "ok", time_cs: 1534 }])
    await as(db, admin, async (tx) => {
      await tx.query("select public.save_results($1, $2::jsonb)", [q, lines])
      await tx.query("select public.submit_results($1)", [q])
      await tx.query("select public.approve_results($1)", [q])
    })
    // The first League round is registered for (Q12, 0009), so it opens for registration.
    await openRound(r16)
    const { rows } = await db.query<{ status: string }>("select status from public.competition_rounds where id = $1", [r16])
    expect(rows[0]!.status).toBe("registration_open")
  })

  it("rejects a prerequisite cycle", async () => {
    const ev = await newEvent()
    const a = await addRound(ev, { catalogue: 1, key: "a" })
    const b = await addRound(ev, { catalogue: 1, key: "b", prereqs: [a] })
    const msg = await refusal(db.query("insert into public.round_prerequisites values ($1, $2)", [a, b]))
    expect(msg).toMatch(/cycle/)
  })

  it("rejects transitions outside the state model", async () => {
    const ev = await newEvent()
    const r = await addRound(ev, { catalogue: 2, race: "500m" })
    const msg = await refusal(as(db, admin, (tx) => tx.query("select public.set_round_status($1, 'completed')", [r])))
    expect(msg).toMatch(/cannot move from draft to completed/)
  })

  it("refuses to open registration without a future deadline", async () => {
    const ev = await newEvent()
    const r = await addRound(ev, { catalogue: 3, race: "middle" })
    const msg = await refusal(as(db, admin, (tx) => tx.query("select public.set_round_status($1, 'registration_open')", [r])))
    expect(msg).toMatch(/deadline/)
  })
})

describe("club race entries", () => {
  let round: string
  let a101: string, a102: string, a103: string, a201: string

  beforeAll(async () => {
    a101 = await athleteId(101)
    a102 = await athleteId(102)
    a103 = await athleteId(103)
    a201 = await athleteId(201)
    const ev = await newEvent()
    // Only تحت 13 and عمومي may enter this synthetic round.
    round = await addRound(ev, { catalogue: 5, race: "one_lap", categories: ["cadet13", "senior"] })
  })

  it("refuses entries while the round is in draft", async () => {
    const msg = await refusal(submit(sscAdmin, round, [a101]))
    expect(msg).toMatch(/not open for registration/)
  })

  it("accepts the club's own eligible athletes, several at once", async () => {
    await openRound(round)
    await submit(sscAdmin, round, [a101, a102])
    const { rows } = await as(db, sscAdmin, (tx) =>
      tx.query<{ category_id: string }>("select category_id from public.race_entries where round_id = $1 order by 1", [round])
    )
    expect(rows.map((r) => r.category_id)).toEqual(["cadet13", "senior"])
  })

  it("refuses a duplicate entry", async () => {
    expect(await refusal(submit(sscAdmin, round, [a101]))).toMatch(/already entered/)
  })

  it("refuses another club's athlete, and enters nothing from that request", async () => {
    expect(await refusal(submit(zscAdmin, round, [a101]))).toMatch(/not registered to this club/)
  })

  it("refuses an athlete with no birth year, naming the reason", async () => {
    expect(await refusal(submit(sscAdmin, round, [a103]))).toMatch(/no birth year/)
  })

  it("refuses an ineligible category", async () => {
    const ev = await newEvent()
    const seniorsOnly = await addRound(ev, { catalogue: 15, race: "points_5000_track", categories: ["senior"] })
    await openRound(seniorsOnly)
    expect(await refusal(submit(sscAdmin, seniorsOnly, [a101]))).toMatch(/not eligible/)
  })

  it("lets an athlete enter a different distance", async () => {
    const ev = await newEvent()
    const other = await addRound(ev, { catalogue: 1, race: "200m" })
    await openRound(other)
    await submit(sscAdmin, other, [a101])
  })

  it("keeps each club's entries private", async () => {
    await submit(zscAdmin, round, [a201])
    const ssc = await as(db, sscAdmin, (tx) => tx.query("select * from public.race_entries where round_id = $1", [round]))
    expect(ssc.rows).toHaveLength(2)
    const zsc = await as(db, zscAdmin, (tx) => tx.query("select * from public.race_entries where round_id = $1", [round]))
    expect(zsc.rows).toHaveLength(1)
  })

  it("hides draft rounds from clubs", async () => {
    const ev = await newEvent()
    const draft = await addRound(ev, { catalogue: 2, race: "500m" })
    const { rows } = await as(db, sscAdmin, (tx) => tx.query("select * from public.competition_rounds where id = $1", [draft]))
    expect(rows).toHaveLength(0)
  })

  it("blocks entries and withdrawals after the deadline, but allows an audited federation exception", async () => {
    const ev = await newEvent()
    const late = await addRound(ev, { catalogue: 4, race: "100m" })
    await openRound(late)
    await submit(sscAdmin, late, [a102])
    const { rows } = await db.query<{ id: string }>("select id from public.race_entries where round_id = $1", [late])
    // Simulate the deadline passing.
    await db.query("update public.competition_rounds set registration_deadline = now() - interval '1 minute' where id = $1", [late])

    expect(await refusal(submit(sscAdmin, late, [a101]))).toMatch(/deadline .* has passed/)
    expect(
      await refusal(as(db, sscAdmin, (tx) => tx.query("select public.withdraw_race_entry($1)", [rows[0]!.id])))
    ).toMatch(/closed/)

    expect(
      await refusal(as(db, admin, (tx) => tx.query("select public.federation_enter_athlete($1, $2, '')", [late, a101])))
    ).toMatch(/reason/)
    await as(db, admin, (tx) =>
      tx.query("select public.federation_enter_athlete($1, $2, 'Club form received by email before deadline')", [late, a101])
    )
    const audit = await db.query("select 1 from public.audit_log where action = 'entry.federation_exception'")
    expect(audit.rows).toHaveLength(1)
  })

  it("withdraws an entry while registration is open", async () => {
    const ev = await newEvent()
    const r = await addRound(ev, { catalogue: 2, race: "500m" })
    await openRound(r)
    await submit(sscAdmin, r, [a102])
    const { rows } = await db.query<{ id: string }>("select id from public.race_entries where round_id = $1", [r])
    await as(db, sscAdmin, (tx) => tx.query("select public.withdraw_race_entry($1)", [rows[0]!.id]))
    // Withdrawn entries do not block re-entry.
    await submit(sscAdmin, r, [a102])
  })
})

describe("add_catalogue_rounds", () => {
  const payload = (n: number) =>
    JSON.stringify(
      planRounds(n, SEASON_2026_2027).map((r) => ({
        catalogue_number: r.catalogueNumber,
        championship: r.championship,
        race_code: r.race,
        round_key: r.roundKey,
        name_ar: r.nameAr,
        entry_mode: r.entryMode,
        eligible_categories: r.eligibleCategories,
        ruleset_version: SEASON_2026_2027.version,
        prerequisites: r.prerequisites.map((p) => ({ championship: p.championship, race_code: p.race, round_key: p.roundKey })),
      }))
    )
  it("refuses a League row before its Qualifications round exists, creating nothing", async () => {
    const fresh = await createTestDb()
    const freshAdmin = await makeFederationAdmin(fresh)
    const ev = await as(fresh, freshAdmin, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        "select public.create_event('2026-2027', 'national_league', 'الدوري', null, null) as id"
      )
      return rows[0]!.id
    })
    const msg = await refusal(
      as(fresh, freshAdmin, (tx) => tx.query("select public.add_catalogue_rounds($1, $2::jsonb)", [ev, payload(7)]))
    )
    expect(msg).toMatch(/prerequisite round first/)
    const { rows } = await fresh.query("select 1 from public.competition_rounds")
    expect(rows).toHaveLength(0)
  })

  it("creates a multi-round row with its internal and cross-event prerequisites", async () => {
    const fresh = await createTestDb()
    const freshAdmin = await makeFederationAdmin(fresh)
    const mk = (champ: string) =>
      as(fresh, freshAdmin, async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          "select public.create_event('2026-2027', $1::public.championship, 'x', null, null) as id",
          [champ]
        )
        return rows[0]!.id
      })
    const q = await mk("qualifications")
    const nl = await mk("national_league")
    await as(fresh, freshAdmin, (tx) => tx.query("select public.add_catalogue_rounds($1, $2::jsonb)", [q, payload(3)]))
    await as(fresh, freshAdmin, (tx) => tx.query("select public.add_catalogue_rounds($1, $2::jsonb)", [nl, payload(7)]))
    const { rows } = await fresh.query<{ round: string; prereq: string }>(
      `select r.round_key as round, p.round_key as prereq from public.round_prerequisites x
       join public.competition_rounds r on r.id = x.round_id join public.competition_rounds p on p.id = x.prerequisite_round_id
       order by 1`
    )
    expect(rows).toEqual([
      { round: "level_b", prereq: "qualification" },
      { round: "r24", prereq: "qualification" },
      { round: "sf", prereq: "r24" },
    ])
    expect(
      await refusal(as(fresh, freshAdmin, (tx) => tx.query("select public.add_catalogue_rounds($1, $2::jsonb)", [q, payload(7)])))
    ).toMatch(/another championship/)
  })
})

describe("start lists", () => {
  let round: string
  let a101: string, a102: string

  beforeAll(async () => {
    a101 = await athleteId(101)
    a102 = await athleteId(102)
    const ev = await newEvent()
    round = await addRound(ev, { catalogue: 2, race: "500m" })
    await openRound(round)
    await submit(sscAdmin, round, [a101, a102])
  })

  it("cannot be published while registration is open", async () => {
    expect(await refusal(publishStartList(round))).toMatch(/Close registration/)
  })

  it("cannot be skipped with a plain status change", async () => {
    await as(db, admin, (tx) => tx.query("select public.set_round_status($1, 'registration_closed')", [round]))
    expect(
      await refusal(as(db, admin, (tx) => tx.query("select public.set_round_status($1, 'start_list_published')", [round])))
    ).toMatch(/start-list screen/)
  })

  it("refuses a list that leaves out an entered athlete", async () => {
    const list = await startListFor(round)
    const trimmed = {
      ...list,
      groups: list.groups.map((g) => ({ ...g, heats: g.heats.map((h) => ({ ...h, lanes: h.lanes.filter((l) => l.entrant.athleteId !== a102) })) })),
    }
    expect(await refusal(publishStartList(round, trimmed))).toMatch(/does not match the entries/)
  })

  it("refuses a list the rules engine marked not official", async () => {
    const list = { ...(await startListFor(round)), official: false, blockers: [{ openQuestion: "Q2", detail: "x" }] }
    expect(await refusal(publishStartList(round, list))).toMatch(/not official: Q2/)
  })

  it("refuses a club admin", async () => {
    const list = await startListFor(round)
    expect(
      await refusal(as(db, sscAdmin, (tx) => tx.query("select public.publish_start_list($1, $2::jsonb)", [round, JSON.stringify(list)])))
    ).toMatch(/federation admin/)
  })

  it("publishes version 1 with a lane row per athlete and moves the round on", async () => {
    await publishStartList(round)
    const v = await db.query("select version from public.start_lists where round_id = $1", [round])
    expect(v.rows).toEqual([{ version: 1 }])
    const lanes = await db.query("select count(*)::int as n from public.start_list_lanes l join public.start_lists s on s.id = l.start_list_id where s.round_id = $1", [round])
    expect(lanes.rows).toEqual([{ n: 2 }])
    const r = await db.query("select status from public.competition_rounds where id = $1", [round])
    expect(r.rows).toEqual([{ status: "start_list_published" }])
  })

  it("lets a club read the published list but not the lane table", async () => {
    const lists = await as(db, sscAdmin, (tx) => tx.query("select version from public.start_lists where round_id = $1", [round]))
    expect(lists.rows).toHaveLength(1)
    const lanes = await as(db, sscAdmin, (tx) => tx.query("select * from public.start_list_lanes"))
    expect(lanes.rows).toHaveLength(0)
  })
})
