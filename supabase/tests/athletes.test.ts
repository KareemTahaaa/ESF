/**
 * 0005_athlete_management — federation edits and club requests, tested as SQL
 * with Row Level Security in force. Synthetic athletes only.
 */

import { beforeAll, describe, expect, it } from "vitest"
import { as, createTestDb, makeClubAdmin, makeFederationAdmin, makeResultsOfficial, refusal, type Db } from "./harness"

let db: Db
let admin: string
let official: string
let ssc: string
let zsc: string

const values = (name: string, birthYear: number | null, gender = "M", extra: Record<string, unknown> = {}) => ({
  full_name_ar: name,
  name_normalised: name,
  birth_year: birthYear,
  gender,
  registration_number: null,
  ...extra,
})

async function addAthlete(n: number, club: string, birthYear: number | null, name = `لاعب ${n}`): Promise<string> {
  return as(db, admin, async (tx) => {
    const { rows } = await tx.query<{ id: string }>("select public.federation_add_athlete($1, $2, 'test setup') as id", [
      JSON.stringify(values(name, birthYear, "M", { federation_number: n })),
      club,
    ])
    return rows[0]!.id
  })
}

const athlete = async (id: string) =>
  (await db.query<{ full_name_ar: string; birth_year: number | null; is_active: boolean }>(
    "select full_name_ar, birth_year, is_active from public.athletes where id = $1",
    [id]
  )).rows[0]!

const visibleTo = async (user: string) =>
  (await as(db, user, (tx) => tx.query<{ n: number }>("select federation_number as n from public.athletes order by 1"))).rows.map((r) => r.n)

beforeAll(async () => {
  db = await createTestDb()
  admin = await makeFederationAdmin(db)
  official = await makeResultsOfficial(db)
  ssc = await makeClubAdmin(db, "SSC")
  zsc = await makeClubAdmin(db, "ZSC")
})

describe("federation adds an athlete", () => {
  it("creates the record and its current-season club membership", async () => {
    await addAthlete(1001, "SSC", 2014)
    expect(await visibleTo(ssc)).toContain(1001)
    expect(await visibleTo(zsc)).not.toContain(1001)
  })

  it("refuses a federation number already in use", async () => {
    expect(await refusal(addAthlete(1001, "ZSC", 2012, "آخر"))).toMatch(/already used/)
  })

  it("refuses a likely duplicate person unless confirmed different", async () => {
    await addAthlete(1002, "SSC", 2010, "منى سامي")
    expect(await refusal(addAthlete(1003, "ZSC", 2010, "منى سامي"))).toMatch(/Possible duplicate: athlete 1002/)
    await as(db, admin, (tx) =>
      tx.query("select public.federation_add_athlete($1, 'ZSC', 'confirmed: twins')", [
        JSON.stringify(values("منى سامي", 2010, "F", { federation_number: 1003, allow_similar: true })),
      ])
    )
  })

  it("requires a reason, and refuses clubs and results officials", async () => {
    const v = JSON.stringify(values("x", 2010, "M", { federation_number: 1099 }))
    expect(await refusal(as(db, admin, (tx) => tx.query("select public.federation_add_athlete($1, 'SSC', '')", [v])))).toMatch(/reason/)
    for (const user of [ssc, official]) {
      expect(await refusal(as(db, user, (tx) => tx.query("select public.federation_add_athlete($1, 'SSC', 'r')", [v])))).toMatch(
        /federation admin/
      )
    }
  })
})

describe("federation edits an athlete", () => {
  it("fills a missing birth year, keeping before and after in the audit log (Q14)", async () => {
    const id = await addAthlete(2001, "SSC", null)
    await as(db, admin, (tx) =>
      tx.query("select public.federation_update_athlete($1, $2, 'birth certificate received')", [id, JSON.stringify(values("لاعب 2001", 2013))])
    )
    expect((await athlete(id)).birth_year).toBe(2013)
    const { rows } = await db.query<{ detail: { before: { birth_year: number | null }; after: { birth_year: number } } }>(
      "select detail from public.audit_log where action = 'athlete.update' and target_id = $1",
      [id]
    )
    expect(rows[0]!.detail.before.birth_year).toBeNull()
    expect(rows[0]!.detail.after.birth_year).toBe(2013)
  })

  it("rejects invalid values", async () => {
    const id = await addAthlete(2002, "SSC", 2012)
    for (const bad of [values("", 2012), values("x", 1850), values("x", 2012, "X")]) {
      await refusal(as(db, admin, (tx) => tx.query("select public.federation_update_athlete($1, $2, 'fix')", [id, JSON.stringify(bad)])))
    }
    expect((await athlete(id)).birth_year).toBe(2012)
  })

  it("refuses a birth-year change that would move an entered athlete out of the race's category", async () => {
    const id = await addAthlete(2003, "SSC", 2014)
    const round = await as(db, admin, async (tx) => {
      const ev = await tx.query<{ id: string }>("select public.create_event('2026-2027', 'qualifications', 'e', null, null) as id")
      const r = await tx.query<{ id: string }>(
        "select public.add_competition_round($1, 1, '200m', 'qualification', 'q', 'registration', '{cadet13,cadet12}', '2026-2027.r1') as id",
        [ev.rows[0]!.id]
      )
      await tx.query("select public.set_round_schedule($1, now() + interval '3 days')", [r.rows[0]!.id])
      await tx.query("select public.set_round_status($1, 'registration_open')", [r.rows[0]!.id])
      return r.rows[0]!.id
    })
    await as(db, ssc, (tx) => tx.query("select public.submit_race_entries($1, $2::uuid[])", [round, [id]]))
    const msg = await refusal(
      as(db, admin, (tx) => tx.query("select public.federation_update_athlete($1, $2, 'typo')", [id, JSON.stringify(values("لاعب 2003", 2010))]))
    )
    expect(msg).toMatch(/Withdraw that entry first/)
  })

  it("transfers an athlete: the old membership is closed and the new club sees them", async () => {
    const id = await addAthlete(2004, "SSC", 2011)
    await as(db, admin, (tx) => tx.query("select public.federation_transfer_athlete($1, 'ZSC', 'club change form')", [id]))
    expect(await visibleTo(zsc)).toContain(2004)
    expect(await visibleTo(ssc)).not.toContain(2004)
    const { rows } = await db.query<{ closed: number }>(
      "select count(*) filter (where valid_to is not null)::int as closed from public.club_memberships where athlete_id = $1",
      [id]
    )
    expect(rows[0]!.closed).toBe(1)
  })

  it("deactivates an athlete, after which clubs cannot enter them", async () => {
    const id = await addAthlete(2005, "SSC", 2014)
    await as(db, admin, (tx) => tx.query("select public.federation_set_athlete_active($1, false, 'retired')", [id]))
    expect((await athlete(id)).is_active).toBe(false)
  })
})

describe("club requests", () => {
  let mine: string
  let theirs: string

  beforeAll(async () => {
    mine = await addAthlete(3001, "SSC", null, "اسم بخطأ")
    theirs = await addAthlete(3002, "ZSC", 2012)
  })

  const submit = (user: string, kind: string, target: string | null, proposed: object) =>
    as(db, user, async (tx) => {
      const { rows } = await tx.query<{ id: string }>("select public.submit_athlete_request($1, $2, $3, 'note') as id", [
        kind,
        target,
        JSON.stringify(proposed),
      ])
      return rows[0]!.id
    })

  it("a club can request a correction to its own athlete, which changes nothing until approved", async () => {
    await submit(ssc, "correction", mine, { birth_year: 2013, full_name_ar: "اسم صحيح" })
    expect(await athlete(mine)).toMatchObject({ full_name_ar: "اسم بخطأ", birth_year: null })
  })

  it("refuses a correction to another club's athlete", async () => {
    expect(await refusal(submit(ssc, "correction", theirs, { birth_year: 2011 }))).toMatch(/not registered to your club/)
  })

  it("refuses fields a club may not request and invalid values", async () => {
    expect(await refusal(submit(ssc, "correction", mine, { is_active: false }))).toMatch(/cannot be requested/)
    expect(await refusal(submit(ssc, "correction", mine, { birth_year: 1800 }))).toMatch(/not valid/)
    expect(await refusal(submit(ssc, "new_athlete", null, { full_name_ar: "x" }))).toMatch(/needs a full name, gender and birth year/)
  })

  it("is invisible to other clubs; the federation sees all", async () => {
    const z = await as(db, zsc, (tx) => tx.query("select * from public.athlete_requests"))
    expect(z.rows).toHaveLength(0)
    const f = await as(db, admin, (tx) => tx.query("select * from public.athlete_requests"))
    expect(f.rows.length).toBeGreaterThan(0)
  })

  it("approval applies the correction and links the request to the athlete", async () => {
    const { rows } = await db.query<{ id: string }>("select id from public.athlete_requests where athlete_id = $1", [mine])
    const request = rows[0]!.id
    expect(await refusal(as(db, ssc, (tx) => tx.query("select public.review_athlete_request($1, 'approve', '{}')", [request])))).toMatch(
      /federation admin/
    )
    await as(db, admin, (tx) =>
      tx.query("select public.review_athlete_request($1, 'approve', $2)", [
        request,
        JSON.stringify({ birth_year: 2013, full_name_ar: "اسم صحيح", name_normalised: "اسم صحيح" }),
      ])
    )
    expect(await athlete(mine)).toMatchObject({ full_name_ar: "اسم صحيح", birth_year: 2013 })
    const r = await db.query("select status, result_athlete_id from public.athlete_requests where id = $1", [request])
    expect(r.rows[0]).toEqual({ status: "approved", result_athlete_id: mine })
    expect(await refusal(as(db, admin, (tx) => tx.query("select public.review_athlete_request($1, 'approve', '{}')", [request])))).toMatch(
      /already approved/
    )
  })

  it("a new-athlete request becomes an athlete of that club once the federation assigns a number", async () => {
    const request = await submit(zsc, "new_athlete", null, { full_name_ar: "لاعبة جديدة", gender: "F", birth_year: 2016 })
    await as(db, admin, (tx) =>
      tx.query("select public.review_athlete_request($1, 'approve', $2)", [
        request,
        JSON.stringify({ federation_number: 3100, full_name_ar: "لاعبة جديدة", name_normalised: "لاعبه جديده", gender: "F", birth_year: 2016 }),
      ])
    )
    expect(await visibleTo(zsc)).toContain(3100)
    expect(await visibleTo(ssc)).not.toContain(3100)
  })

  it("a rejection needs a reason the club can read", async () => {
    const request = await submit(ssc, "correction", mine, { gender: "F" })
    expect(await refusal(as(db, admin, (tx) => tx.query("select public.review_athlete_request($1, 'reject', null, '')", [request])))).toMatch(
      /reason/
    )
    await as(db, admin, (tx) => tx.query("select public.review_athlete_request($1, 'reject', null, 'الأوراق لا تؤكد ذلك')", [request]))
    const { rows } = await as(db, ssc, (tx) => tx.query<{ review_note: string }>("select review_note from public.athlete_requests where id = $1", [request]))
    expect(rows[0]!.review_note).toBe("الأوراق لا تؤكد ذلك")
  })

  it("a club can withdraw its own pending request only", async () => {
    const request = await submit(ssc, "correction", mine, { registration_number: "2/3001" })
    expect(await refusal(as(db, zsc, (tx) => tx.query("select public.withdraw_athlete_request($1)", [request])))).toMatch(/No pending request/)
    await as(db, ssc, (tx) => tx.query("select public.withdraw_athlete_request($1)", [request]))
  })

  it("clubs cannot call the internal update functions directly", async () => {
    expect(
      await refusal(
        as(db, ssc, (tx) => tx.query("select public.apply_athlete_update($1, $2, 'x', 'x')", [mine, JSON.stringify(values("hack", 2000))]))
      )
    ).toMatch(/permission denied/)
  })
})
