// 抓取总入口：按 source 把请求分发到对应实现。目前只有 CPS。

import { selectCourses } from "../model/index.js";
import type { CpsCourse } from "../model/cps.js";
import type { ScrapeRequest, TeeTime } from "../types.js";
import { scrapeCps } from "./cps.js";

/** 按 ScrapeRequest 抓取并返回统一的 TeeTime 列表。 */
export async function scrape(request: ScrapeRequest): Promise<TeeTime[]> {
  const { source, site, courseIds, date, holes = 18, players = 4 } = request;
  const courses = selectCourses(source, site, courseIds);

  if (courses.length === 0) {
    throw new Error(`没有匹配的球场（source=${source}, site=${site ?? "*"}, courseIds=${courseIds?.join(",") ?? "*"}）`);
  }

  switch (source) {
    case "cps":
      return scrapeCps(courses as CpsCourse[], date, holes, players);
    default:
      throw new Error(`暂不支持的 source: ${source}`);
  }
}
