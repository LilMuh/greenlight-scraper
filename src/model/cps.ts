// CPS / Club Prophet 订位系统（如 golfvancouver.cps.golf）的球场模型 + 我们跟踪的球场。
//
// CPS 用一个小整数区分同一站点下的球场。这里用枚举，让调用处读 GolfVancouverCourseId.MCCLEERY
// 而不是裸的 3。这个整数【只在本站点内唯一】——golfvancouver 的 1 是 Langara，golfburnaby 的 1
// 是 Burnaby Mountain，所以每个站点一个枚举，不存在一张跨站点的总表。
//
// 数字都是从站点自己的 ${onlineApi}/OnlineCourses 响应实测抄下来的，不是猜的：
//   golfvancouver 2026-07-08，golfburnaby 2026-08-24，westcoastgolfgroup 2026-09-03。

export enum GolfVancouverCourseId {
  LANGARA = 1,
  FRASERVIEW = 2,
  MCCLEERY = 3,
}

export enum GolfBurnabyCourseId {
  BURNABY_MOUNTAIN = 1,
  RIVERWAY = 2,
}

// West Coast Golf Group（wcgg.ca）。三处物业但 Swaneset 在 CPS 里是两条独立的 18 洞球道，
// 各有自己的 courseId，所以这里是四项而不是三项。
export enum WestCoastGolfGroupCourseId {
  HAZELMERE = 1,
  BELMONT = 2,
  SWANESET_RESORT = 3,
  SWANESET_LINKS = 4,
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
  // westcoastgolfgroup 的名字统一去掉末尾的 "Course"（"Swaneset Resort" 而不是站点响应里的
  // "Swaneset Resort Course"）。上面两个站点的球场没跟着改——名字只是展示列，course 表的
  // 幂等 upsert 随时能改，slug 才是不能动的业务键。
  { source: "cps", id: "hazelmere", name: "Hazelmere Golf", site: "westcoastgolfgroup", cpsCourseId: WestCoastGolfGroupCourseId.HAZELMERE },
  { source: "cps", id: "belmont", name: "Belmont Golf", site: "westcoastgolfgroup", cpsCourseId: WestCoastGolfGroupCourseId.BELMONT },
  { source: "cps", id: "swaneset-resort", name: "Swaneset Resort", site: "westcoastgolfgroup", cpsCourseId: WestCoastGolfGroupCourseId.SWANESET_RESORT },
  { source: "cps", id: "swaneset-links", name: "Swaneset Links", site: "westcoastgolfgroup", cpsCourseId: WestCoastGolfGroupCourseId.SWANESET_LINKS },
];
