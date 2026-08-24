// CPS / Club Prophet 订位系统（如 golfvancouver.cps.golf）的球场模型 + 我们跟踪的球场。
//
// CPS 用一个小整数区分同一站点下的球场。这里用枚举，让调用处读 GolfVancouverCourseId.MCCLEERY
// 而不是裸的 3。这个整数【只在本站点内唯一】——golfvancouver 的 1 是 Langara，golfburnaby 的 1
// 是 Burnaby Mountain，所以每个站点一个枚举，不存在一张跨站点的总表。
//
// 数字都是从站点自己的 ${onlineApi}/OnlineCourses 响应实测抄下来的，不是猜的：
//   golfvancouver 2026-07-08，golfburnaby 2026-08-24。

export enum GolfVancouverCourseId {
  LANGARA = 1,
  FRASERVIEW = 2,
  MCCLEERY = 3,
}

export enum GolfBurnabyCourseId {
  BURNABY_MOUNTAIN = 1,
  RIVERWAY = 2,
}

export type CpsCourse = {
  source: "cps";
  id: string; // 我们的短 slug，用于 API / 前端
  name: string; // 展示名
  site: string; // cps.golf 的子域名，如 "golfvancouver"
  cpsCourseId: number; // CPS 站内球场 id，取值见上面按站点分的枚举
};

export const CPS_COURSES: CpsCourse[] = [
  { source: "cps", id: "fraserview", name: "Fraserview Golf Course", site: "golfvancouver", cpsCourseId: GolfVancouverCourseId.FRASERVIEW },
  { source: "cps", id: "langara", name: "Langara Golf Course", site: "golfvancouver", cpsCourseId: GolfVancouverCourseId.LANGARA },
  { source: "cps", id: "mccleery", name: "McCleery Golf Course", site: "golfvancouver", cpsCourseId: GolfVancouverCourseId.MCCLEERY },
  // golfburnaby 的时段响应里 courseName 给的是短名（"Riverway"、"Burnaby Mountain"），
  // 这里写全名，和 GET /courses 以及 course 表的 seed 保持一致。
  { source: "cps", id: "burnaby-mountain", name: "Burnaby Mountain Golf Course", site: "golfburnaby", cpsCourseId: GolfBurnabyCourseId.BURNABY_MOUNTAIN },
  { source: "cps", id: "riverway", name: "Riverway Golf Course", site: "golfburnaby", cpsCourseId: GolfBurnabyCourseId.RIVERWAY },
];
