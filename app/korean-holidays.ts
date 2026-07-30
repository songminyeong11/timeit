export type KoreanHoliday = {
  name: string;
  description: string;
  isSubstitute?: boolean;
};

type SubstitutePolicy = "weekend" | "sunday";

type HolidayGroup = {
  label: string;
  policy?: SubstitutePolicy;
  dates: Date[];
};

type HolidayEntry = KoreanHoliday & {
  group: string;
};

const lunarFormatter = new Intl.DateTimeFormat("en-u-ca-chinese", {
  month: "numeric",
  day: "numeric",
  timeZone: "Asia/Seoul",
});

function calendarDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 3));
}

function calendarKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function lunarMonthDay(date: Date) {
  const parts = lunarFormatter.formatToParts(date);
  const monthValue = parts.find((part) => part.type === "month")?.value ?? "";
  const dayValue = parts.find((part) => part.type === "day")?.value ?? "";
  return {
    month: /^\d+$/.test(monthValue) ? Number(monthValue) : -1,
    day: /^\d+$/.test(dayValue) ? Number(dayValue) : -1,
  };
}

function findLunarDate(year: number, lunarMonth: number, lunarDay: number) {
  let cursor = calendarDate(year, 1, 1);
  const end = calendarDate(year, 12, 31);
  while (cursor <= end) {
    const lunar = lunarMonthDay(cursor);
    if (lunar.month === lunarMonth && lunar.day === lunarDay) return cursor;
    cursor = addDays(cursor, 1);
  }
  return null;
}

export function getKoreanHolidays(year: number) {
  const entries = new Map<string, HolidayEntry[]>();
  const groups = new Map<string, HolidayGroup>();

  const add = (
    date: Date,
    name: string,
    description: string,
    group: string,
    label: string,
    policy?: SubstitutePolicy,
  ) => {
    const key = calendarKey(date);
    entries.set(key, [...(entries.get(key) ?? []), { name, description, group }]);
    const existing = groups.get(group);
    if (existing) existing.dates.push(date);
    else groups.set(group, { label, policy, dates: [date] });
  };

  add(calendarDate(year, 1, 1), "신정", "새해의 첫날", "new-year", "신정");
  add(calendarDate(year, 3, 1), "삼일절", "3·1 독립운동을 기념하는 국경일", "march-first", "삼일절", "weekend");
  if (year >= 2026) add(calendarDate(year, 5, 1), "노동절", "노동의 가치와 권리를 기리는 법정공휴일", "labor-day", "노동절", "weekend");
  add(calendarDate(year, 5, 5), "어린이날", "어린이의 행복과 성장을 기념하는 날", "childrens-day", "어린이날", "weekend");
  add(calendarDate(year, 6, 6), "현충일", "순국선열과 호국영령을 추모하는 날", "memorial-day", "현충일");
  if (year >= 2026) add(calendarDate(year, 7, 17), "제헌절", "대한민국 헌법의 제정과 공포를 기념하는 국경일", "constitution-day", "제헌절", "weekend");
  add(calendarDate(year, 8, 15), "광복절", "대한민국의 광복을 기념하는 국경일", "liberation-day", "광복절", "weekend");
  add(calendarDate(year, 10, 3), "개천절", "우리 민족 최초 국가의 건국을 기념하는 국경일", "foundation-day", "개천절", "weekend");
  add(calendarDate(year, 10, 9), "한글날", "훈민정음의 창제와 반포를 기념하는 국경일", "hangul-day", "한글날", "weekend");
  add(calendarDate(year, 12, 25), "기독탄신일", "예수 그리스도의 탄생을 기념하는 날", "christmas", "기독탄신일", "weekend");

  const lunarNewYear = findLunarDate(year, 1, 1);
  if (lunarNewYear) {
    add(addDays(lunarNewYear, -1), "설날 연휴", "설날 전날", "seollal", "설날", "sunday");
    add(lunarNewYear, "설날", "음력 1월 1일, 새해를 맞는 명절", "seollal", "설날", "sunday");
    add(addDays(lunarNewYear, 1), "설날 연휴", "설날 다음 날", "seollal", "설날", "sunday");
  }

  const buddhasBirthday = findLunarDate(year, 4, 8);
  if (buddhasBirthday) add(buddhasBirthday, "부처님 오신 날", "부처님의 탄생을 기념하는 날", "buddhas-birthday", "부처님 오신 날", "weekend");

  const chuseok = findLunarDate(year, 8, 15);
  if (chuseok) {
    add(addDays(chuseok, -1), "추석 연휴", "추석 전날", "chuseok", "추석", "sunday");
    add(chuseok, "추석", "음력 8월 15일, 수확에 감사하는 명절", "chuseok", "추석", "sunday");
    add(addDays(chuseok, 1), "추석 연휴", "추석 다음 날", "chuseok", "추석", "sunday");
  }

  if (year === 2026) {
    add(calendarDate(2026, 6, 3), "제9회 전국동시지방선거", "지역 대표를 선출하는 법정 선거일", "2026-local-election", "전국동시지방선거");
  }

  const occupied = new Set(entries.keys());
  for (const [groupKey, group] of groups) {
    if (!group.policy) continue;
    const fallsOnWeekend = group.dates.some((date) => group.policy === "weekend" ? date.getUTCDay() === 0 || date.getUTCDay() === 6 : date.getUTCDay() === 0);
    const overlapsAnotherHoliday = group.dates.some((date) => {
      const day = date.getUTCDay();
      return day !== 0 && day !== 6 && (entries.get(calendarKey(date))?.some((entry) => entry.group !== groupKey) ?? false);
    });
    if (!fallsOnWeekend && !overlapsAnotherHoliday) continue;

    let substitute = addDays(group.dates.reduce((latest, date) => date > latest ? date : latest), 1);
    while (substitute.getUTCDay() === 0 || substitute.getUTCDay() === 6 || occupied.has(calendarKey(substitute))) {
      substitute = addDays(substitute, 1);
    }
    const key = calendarKey(substitute);
    entries.set(key, [{
      name: `${group.label} 대체공휴일`,
      description: `${group.label}이 주말 또는 다른 공휴일과 겹쳐 지정된 쉬는 날`,
      isSubstitute: true,
      group: `${groupKey}-substitute`,
    }]);
    occupied.add(key);
  }

  return new Map(
    [...entries].map(([key, holidays]) => [
      key,
      holidays.map(({ group: _group, ...holiday }) => holiday),
    ]),
  );
}
