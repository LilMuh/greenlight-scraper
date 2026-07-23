// CPS / Club Prophet 订位系统（如 golfvancouver.cps.golf）的球场模型 + 我们跟踪的球场。
//
// CPS 用一个小整数区分同一站点下的球场。这里用枚举，让调用处读 CpsCourseId.MCCLEERY 而不是裸的 3。
// （2026-07-08 从 ${onlineApi}/OnlineCourses 实测确认。）

export enum CpsCourseId {
  LANGARA = 1,
  FRASERVIEW = 2,
  MCCLEERY = 3,
}

export type CpsCourse = {
  source: "cps";
  id: string; // 我们的短 slug，用于 API / 前端
  name: string; // 展示名
  site: string; // cps.golf 的子域名，如 "golfvancouver"
  cpsCourseId: CpsCourseId; // CPS 内部球场 id
};

export const CPS_COURSES: CpsCourse[] = [
  { source: "cps", id: "fraserview", name: "Fraserview Golf Course", site: "golfvancouver", cpsCourseId: CpsCourseId.FRASERVIEW },
  { source: "cps", id: "langara", name: "Langara Golf Course", site: "golfvancouver", cpsCourseId: CpsCourseId.LANGARA },
  { source: "cps", id: "mccleery", name: "McCleery Golf Course", site: "golfvancouver", cpsCourseId: CpsCourseId.MCCLEERY },
];
