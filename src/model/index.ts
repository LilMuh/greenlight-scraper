// 所有已配置球场的总登记处。目前只有 CPS，之后接入 ChronoGolf 等只需在这里汇入。

import { CPS_COURSES, type CpsCourse } from "./cps.js";

// 现在只有 CPS 一种球场类型；将来是 CpsCourse | ChronogolfCourse 的联合类型。
export type Course = CpsCourse;

export const ALL_COURSES: Course[] = [...CPS_COURSES];

/** 按 slug 查一个球场。 */
export function findCourseBySlug(slug: string): Course | undefined {
  return ALL_COURSES.find((course) => course.id === slug);
}

/**
 * 挑出要抓的球场：给了 slug 列表就按列表挑（并保留顺序、丢掉未知的），
 * 没给就返回符合 source/site 的全部球场。
 */
export function selectCourses(source: string, site: string | undefined, slugs: string[] | undefined): Course[] {
  if (slugs && slugs.length > 0) {
    return slugs.map(findCourseBySlug).filter((course): course is Course => course != null);
  }
  return ALL_COURSES.filter((course) => course.source === source && (site == null || course.site === site));
}
