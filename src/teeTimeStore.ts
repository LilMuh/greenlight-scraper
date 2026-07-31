// 把抓到的时段写进 Postgres 的 tee_time 表。schema 归 greenlight-database 的 Liquibase。
//
// 对一个 partition（同 source+site+日期+洞数、本轮涉及的球场），一个事务里做两件事：
//   1. 把这些球场现存可订的行全部置为 available=false、available_seats=0；
//   2. 把本轮真实抓到的时段 upsert 回真实空位数（available_seats=maxPlayer）。
// 于是「上一次有、这次没了（被订满）」的时段自然停在 available_seats=0，供后端做上升沿判断。
//
// tee_time.course_id 是 course 表的数字外键。scraper 只认 slug，不碰数字 id——写库时用子查询
// 按 slug 从 course 表找出对应的数字 id。course 表归 Liquibase 维护，这里只读它来解析。

import { Pool } from "pg";
import type { TeeTime } from "./types.js";

const DATABASE_URL = process.env.DATABASE_URL?.trim() || "postgres://greenlight:greenlight@localhost:5432/greenlight";

const pool = new Pool({ connectionString: DATABASE_URL });

// 一个 partition 的定位信息（都来自 scrape 请求本身）
export type Partition = {
  source: string;
  site: string;
  date: string; // "2026-07-25"
  holes: number;
  courseIds: string[]; // 本轮涉及的球场 slug，圈定要标记不可订的范围
};

// 把本轮涉及球场（按 slug 解析成数字 course_id）的现存可订行清零：不可订、空位数归 0
const MARK_UNAVAILABLE = `
  update tee_time set available = false, available_seats = 0, updated_at = now()
  where source = $1 and site = $2 and play_date = $3 and holes = $4
    and course_id in (select id from course where slug = any($5::text[])) and available = true
`;

// 插入一条时段；course_id 由 slug 子查询解析。命中唯一键（同一时段）则更新价格与空位数
const UPSERT_SLOT = `
  insert into tee_time
    (source, site, course_id, play_date, time_local, holes, available_seats, price, available, updated_at)
  values ($1, $2, (select id from course where slug = $3), $4, $5, $6, $7, $8, $7 > 0, now())
  on conflict (play_date, source, site, course_id, holes, time_local)
  do update set price = excluded.price, available_seats = excluded.available_seats, available = excluded.available, updated_at = now()
`;

/** 写库，返回本轮抓到的时段数。 */
export async function saveTeeTimes(partition: Partition, teeTimes: TeeTime[]): Promise<number> {
  const { source, site, date, holes, courseIds } = partition;
  const client = await pool.connect();
  try {
    await client.query("begin");

    await client.query(MARK_UNAVAILABLE, [source, site, date, holes, courseIds]);

    for (const teeTime of teeTimes) {
      await client.query(UPSERT_SLOT, [source, site, teeTime.courseId, date, teeTime.time, holes, teeTime.availableSeats, teeTime.price]);
    }

    await client.query("commit");
    return teeTimes.length;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
