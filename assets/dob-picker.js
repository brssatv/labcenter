(function initDobPicker(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LabCenterDobPicker = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const MONTH_NAMES = Object.freeze([
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ]);
  const WEEKDAY_NAMES = Object.freeze(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  const STEPS = Object.freeze(["range", "year", "month", "day"]);

  function padDatePart(value) {
    return String(value).padStart(2, "0");
  }

  function isValidDateParts(year, month, day) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
    const candidate = new Date(Date.UTC(year, month - 1, day));
    return candidate.getUTCFullYear() === year
      && candidate.getUTCMonth() === month - 1
      && candidate.getUTCDate() === day;
  }

  function toIsoDate(year, month, day) {
    if (!isValidDateParts(year, month, day)) return "";
    return `${String(year).padStart(4, "0")}-${padDatePart(month)}-${padDatePart(day)}`;
  }

  function parseIsoDate(value) {
    const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!isValidDateParts(year, month, day)) return null;
    return { year, month, day, iso: toIsoDate(year, month, day) };
  }

  function parseDisplayDate(value) {
    const match = String(value || "").trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
    if (!match) return null;
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    if (!isValidDateParts(year, month, day)) return null;
    return { year, month, day, iso: toIsoDate(year, month, day) };
  }

  function formatIsoDateForDisplay(value) {
    const parsed = parseIsoDate(value);
    if (!parsed) return "";
    return `${padDatePart(parsed.day)}/${padDatePart(parsed.month)}/${parsed.year}`;
  }

  function getDobYearRanges(options = {}) {
    const currentYear = new Date().getFullYear();
    const minYear = Math.max(1, Math.floor(Number(options.minYear || 1900)));
    const maxYear = Math.max(minYear, Math.floor(Number(options.maxYear || currentYear)));
    const ranges = [];
    for (let decade = Math.floor(maxYear / 10) * 10; decade >= Math.floor(minYear / 10) * 10; decade -= 10) {
      const start = Math.max(minYear, decade);
      const end = Math.min(maxYear, decade + 9);
      ranges.push({ start, end, label: `${start}–${end}` });
    }
    return ranges;
  }

  function getYearsInRange(start, end) {
    const first = Math.floor(Number(start));
    const last = Math.floor(Number(end));
    if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return [];
    return Array.from({ length: last - first + 1 }, (_, index) => last - index);
  }

  function getDaysInMonth(year, month) {
    const normalizedYear = Math.floor(Number(year));
    const normalizedMonth = Math.floor(Number(month));
    if (!Number.isFinite(normalizedYear) || normalizedMonth < 1 || normalizedMonth > 12) return 0;
    return new Date(Date.UTC(normalizedYear, normalizedMonth, 0)).getUTCDate();
  }

  function getLocalIsoDate(date = new Date()) {
    return toIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  function isDobWithinBounds(value, options = {}) {
    const parsed = parseIsoDate(value);
    if (!parsed) return false;
    const minYear = Math.max(1, Math.floor(Number(options.minYear || 1900)));
    const maxDate = String(options.maxDate || getLocalIsoDate()).trim();
    return parsed.year >= minYear && parsed.iso <= maxDate;
  }

  function createDobPicker(options = {}) {
    const valueInput = options.valueInput;
    const displayInput = options.displayInput;
    const trigger = options.trigger;
    const modal = options.modal;
    const grid = options.grid;
    const title = options.title;
    const backButton = options.backButton;
    const closeButton = options.closeButton;
    const clearButton = options.clearButton;
    const progress = options.progress;
    const selectedLabel = options.selectedLabel;
    if (!valueInput || !displayInput || !trigger || !modal || !grid || !title) return null;

    const today = options.today instanceof Date ? options.today : new Date();
    const maxDate = getLocalIsoDate(today);
    const maxYear = today.getFullYear();
    const minYear = Math.max(1, Math.floor(Number(options.minYear || 1900)));
    const ranges = getDobYearRanges({ minYear, maxYear });
    let activeStep = "range";
    let selectedRange = null;
    let selectedYear = null;
    let selectedMonth = null;
    let restoreFocusNode = null;
    let isOpen = false;

    function emitCanonicalChange() {
      valueInput.dispatchEvent(new Event("input", { bubbles: true }));
      valueInput.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function updateCanonicalValue(value, { emit = true } = {}) {
      const nextValue = String(value || "");
      const changed = valueInput.value !== nextValue;
      valueInput.value = nextValue;
      if (changed && emit) emitCanonicalChange();
    }

    function getSelectedDateParts() {
      return parseIsoDate(valueInput.value);
    }

    function updateSelectedLabel() {
      if (!selectedLabel) return;
      const parsed = getSelectedDateParts();
      selectedLabel.textContent = parsed
        ? `Selected date: ${formatIsoDateForDisplay(parsed.iso)}`
        : "No date selected";
    }

    function syncFromValue({ emit = false } = {}) {
      const parsed = parseIsoDate(valueInput.value);
      if (parsed && isDobWithinBounds(parsed.iso, { minYear, maxDate })) {
        displayInput.value = formatIsoDateForDisplay(parsed.iso);
        selectedYear = parsed.year;
        selectedMonth = parsed.month;
        selectedRange = ranges.find((range) => parsed.year >= range.start && parsed.year <= range.end) || null;
        displayInput.setCustomValidity("");
        if (emit) emitCanonicalChange();
      } else if (!valueInput.value) {
        displayInput.value = "";
        selectedYear = null;
        selectedMonth = null;
        selectedRange = null;
        displayInput.setCustomValidity("");
      }
      updateSelectedLabel();
    }

    function syncFromDisplay({ showError = false } = {}) {
      const rawValue = displayInput.value.trim();
      if (!rawValue) {
        displayInput.setCustomValidity(showError ? "Select or enter the patient date of birth." : "");
        updateCanonicalValue("");
        updateSelectedLabel();
        return false;
      }

      const parsed = parseDisplayDate(rawValue);
      const isWithinBounds = parsed && isDobWithinBounds(parsed.iso, { minYear, maxDate });
      if (!isWithinBounds) {
        displayInput.setCustomValidity(showError
          ? `Enter a valid date between 01/01/${minYear} and today.`
          : "");
        updateCanonicalValue("");
        updateSelectedLabel();
        return false;
      }

      displayInput.value = formatIsoDateForDisplay(parsed.iso);
      displayInput.setCustomValidity("");
      updateCanonicalValue(parsed.iso);
      selectedYear = parsed.year;
      selectedMonth = parsed.month;
      selectedRange = ranges.find((range) => parsed.year >= range.start && parsed.year <= range.end) || null;
      updateSelectedLabel();
      return true;
    }

    function renderProgress() {
      if (!progress) return;
      const activeIndex = STEPS.indexOf(activeStep);
      const labels = { range: "Range", year: "Year", month: "Month", day: "Day" };
      progress.innerHTML = STEPS.map((step, index) => {
        const state = index === activeIndex ? "current" : index < activeIndex ? "complete" : "upcoming";
        return `<span class="dob-progress-step is-${state}" ${index === activeIndex ? 'aria-current="step"' : ""}><b>${index + 1}</b>${labels[step]}</span>`;
      }).join("");
    }

    function renderRangeStep() {
      title.textContent = "Select the year range";
      grid.className = "dob-picker-grid dob-picker-ranges";
      grid.innerHTML = ranges.map((range) => {
        const selected = selectedRange && selectedRange.start === range.start;
        return `<button type="button" class="dob-choice dob-range-choice${selected ? " is-selected" : ""}" data-dob-choice="range" data-start="${range.start}" data-end="${range.end}" aria-pressed="${selected ? "true" : "false"}"><strong>${range.label}</strong><span>Birth years</span></button>`;
      }).join("");
    }

    function renderYearStep() {
      if (!selectedRange) {
        activeStep = "range";
        renderRangeStep();
        return;
      }
      title.textContent = `Select the year in ${selectedRange.label}`;
      grid.className = "dob-picker-grid dob-picker-years";
      grid.innerHTML = getYearsInRange(selectedRange.start, selectedRange.end).map((year) => {
        const selected = year === selectedYear;
        return `<button type="button" class="dob-choice dob-year-choice${selected ? " is-selected" : ""}" data-dob-choice="year" data-value="${year}" aria-pressed="${selected ? "true" : "false"}">${year}</button>`;
      }).join("");
    }

    function renderMonthStep() {
      if (!selectedYear) {
        activeStep = "year";
        renderYearStep();
        return;
      }
      title.textContent = `Select the month in ${selectedYear}`;
      grid.className = "dob-picker-grid dob-picker-months";
      grid.innerHTML = MONTH_NAMES.map((monthName, index) => {
        const month = index + 1;
        const selected = month === selectedMonth;
        const disabled = selectedYear === maxYear && month > today.getMonth() + 1;
        return `<button type="button" class="dob-choice dob-month-choice${selected ? " is-selected" : ""}" data-dob-choice="month" data-value="${month}" aria-pressed="${selected ? "true" : "false"}" ${disabled ? "disabled" : ""}><strong>${monthName.slice(0, 3)}</strong><span>${monthName}</span></button>`;
      }).join("");
    }

    function renderDayStep() {
      if (!selectedYear || !selectedMonth) {
        activeStep = "month";
        renderMonthStep();
        return;
      }
      title.textContent = `Select the day in ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;
      grid.className = "dob-picker-grid dob-picker-days";
      const firstWeekday = new Date(Date.UTC(selectedYear, selectedMonth - 1, 1)).getUTCDay();
      const numberOfDays = getDaysInMonth(selectedYear, selectedMonth);
      const current = getSelectedDateParts();
      const weekdayMarkup = WEEKDAY_NAMES.map((name) => `<span class="dob-weekday" role="columnheader">${name}</span>`).join("");
      const blankMarkup = Array.from({ length: firstWeekday }, () => '<span class="dob-day-blank" aria-hidden="true"></span>').join("");
      const dayMarkup = Array.from({ length: numberOfDays }, (_, index) => {
        const day = index + 1;
        const iso = toIsoDate(selectedYear, selectedMonth, day);
        const selected = current?.iso === iso;
        const disabled = iso > maxDate;
        return `<button type="button" class="dob-choice dob-day-choice${selected ? " is-selected" : ""}" data-dob-choice="day" data-value="${day}" aria-label="${MONTH_NAMES[selectedMonth - 1]} ${day}, ${selectedYear}" aria-pressed="${selected ? "true" : "false"}" ${disabled ? "disabled" : ""}>${day}</button>`;
      }).join("");
      grid.innerHTML = `${weekdayMarkup}${blankMarkup}${dayMarkup}`;
    }

    function focusFirstChoice() {
      requestAnimationFrame(() => {
        const selected = grid.querySelector(".dob-choice.is-selected:not(:disabled)");
        const first = grid.querySelector(".dob-choice:not(:disabled)");
        (selected || first || closeButton)?.focus();
      });
    }

    function render() {
      renderProgress();
      const isFirstStep = activeStep === "range";
      backButton?.classList.toggle("is-placeholder", isFirstStep);
      backButton?.setAttribute("aria-hidden", isFirstStep ? "true" : "false");
      if (backButton) backButton.tabIndex = isFirstStep ? -1 : 0;
      if (activeStep === "range") renderRangeStep();
      if (activeStep === "year") renderYearStep();
      if (activeStep === "month") renderMonthStep();
      if (activeStep === "day") renderDayStep();
      updateSelectedLabel();
      if (isOpen) focusFirstChoice();
    }

    function open(sourceNode = trigger) {
      const current = getSelectedDateParts();
      if (current) {
        selectedYear = current.year;
        selectedMonth = current.month;
        selectedRange = ranges.find((range) => current.year >= range.start && current.year <= range.end) || null;
      }
      activeStep = "range";
      restoreFocusNode = sourceNode;
      isOpen = true;
      modal.classList.remove("hidden");
      document.body.classList.add("modal-open");
      render();
    }

    function close({ restoreFocus = true } = {}) {
      if (!isOpen) return;
      isOpen = false;
      modal.classList.add("hidden");
      document.body.classList.remove("modal-open");
      if (restoreFocus) restoreFocusNode?.focus();
    }

    function clearDate() {
      displayInput.value = "";
      displayInput.setCustomValidity("");
      selectedRange = null;
      selectedYear = null;
      selectedMonth = null;
      updateCanonicalValue("");
      updateSelectedLabel();
      close();
    }

    trigger.addEventListener("click", () => open(trigger));
    displayInput.addEventListener("input", () => syncFromDisplay({ showError: false }));
    displayInput.addEventListener("change", () => syncFromDisplay({ showError: true }));
    displayInput.addEventListener("blur", () => syncFromDisplay({ showError: Boolean(displayInput.value.trim()) }));
    displayInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" && event.altKey) {
        event.preventDefault();
        open(displayInput);
      }
    });
    displayInput.addEventListener("invalid", () => {
      syncFromDisplay({ showError: true });
      open(displayInput);
    });
    backButton?.addEventListener("click", () => {
      const index = Math.max(0, STEPS.indexOf(activeStep) - 1);
      activeStep = STEPS[index];
      render();
    });
    closeButton?.addEventListener("click", () => close());
    clearButton?.addEventListener("click", clearDate);
    modal.addEventListener("mousedown", (event) => {
      if (event.target === modal) close();
    });
    modal.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(modal.querySelectorAll('button:not(:disabled):not(.hidden):not(.is-placeholder), input:not(:disabled)'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    grid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-dob-choice]");
      if (!button || button.disabled) return;
      const choice = button.dataset.dobChoice;
      if (choice === "range") {
        selectedRange = {
          start: Number(button.dataset.start),
          end: Number(button.dataset.end),
          label: `${button.dataset.start}–${button.dataset.end}`,
        };
        selectedYear = null;
        selectedMonth = null;
        activeStep = "year";
      } else if (choice === "year") {
        selectedYear = Number(button.dataset.value);
        selectedMonth = null;
        activeStep = "month";
      } else if (choice === "month") {
        selectedMonth = Number(button.dataset.value);
        activeStep = "day";
      } else if (choice === "day") {
        const iso = toIsoDate(selectedYear, selectedMonth, Number(button.dataset.value));
        displayInput.value = formatIsoDateForDisplay(iso);
        displayInput.setCustomValidity("");
        updateCanonicalValue(iso);
        updateSelectedLabel();
        close();
        return;
      }
      render();
    });

    syncFromValue();
    return {
      open,
      close,
      clear: clearDate,
      syncFromDisplay,
      syncFromValue,
      getValue() {
        return valueInput.value;
      },
    };
  }

  return {
    MONTH_NAMES,
    formatIsoDateForDisplay,
    getDaysInMonth,
    getDobYearRanges,
    getYearsInRange,
    isDobWithinBounds,
    parseDisplayDate,
    parseIsoDate,
    toIsoDate,
    createDobPicker,
  };
});
