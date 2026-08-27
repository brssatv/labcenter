const test = require("node:test");
const assert = require("node:assert/strict");

const {
  formatIsoDateForDisplay,
  getDaysInMonth,
  getDobYearRanges,
  getYearsInRange,
  isDobWithinBounds,
  parseDisplayDate,
  parseIsoDate,
  toIsoDate,
} = require("../assets/dob-picker.js");

test("DOB picker groups birth years into decade ranges", () => {
  const ranges = getDobYearRanges({ minYear: 1900, maxYear: 2026 });
  assert.deepEqual(ranges[0], { start: 2020, end: 2026, label: "2020–2026" });
  assert.deepEqual(
    ranges.find((range) => range.start === 1940),
    { start: 1940, end: 1949, label: "1940–1949" }
  );
  assert.deepEqual(ranges.at(-1), { start: 1900, end: 1909, label: "1900–1909" });
});

test("DOB picker lists the selected range as individual years", () => {
  assert.deepEqual(getYearsInRange(1940, 1949), [1949, 1948, 1947, 1946, 1945, 1944, 1943, 1942, 1941, 1940]);
});

test("DOB picker converts between stored ISO dates and day-first display dates", () => {
  assert.equal(formatIsoDateForDisplay("1945-08-27"), "27/08/1945");
  assert.deepEqual(parseDisplayDate("27/08/1945"), {
    year: 1945,
    month: 8,
    day: 27,
    iso: "1945-08-27",
  });
  assert.deepEqual(parseIsoDate("1945-08-27"), {
    year: 1945,
    month: 8,
    day: 27,
    iso: "1945-08-27",
  });
});

test("DOB picker validates real calendar days and leap years", () => {
  assert.equal(toIsoDate(1945, 2, 29), "");
  assert.equal(toIsoDate(1944, 2, 29), "1944-02-29");
  assert.equal(getDaysInMonth(1944, 2), 29);
  assert.equal(getDaysInMonth(1945, 2), 28);
});

test("DOB picker rejects future dates and years before the supported range", () => {
  assert.equal(isDobWithinBounds("1945-08-27", { minYear: 1900, maxDate: "2026-08-27" }), true);
  assert.equal(isDobWithinBounds("1899-12-31", { minYear: 1900, maxDate: "2026-08-27" }), false);
  assert.equal(isDobWithinBounds("2026-08-28", { minYear: 1900, maxDate: "2026-08-27" }), false);
});
