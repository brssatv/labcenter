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
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    if (!isValidDateParts(year, month, day)) return null;
    return { year, month, day, iso: toIsoDate(year, month, day) };
  }

  function formatDobInput(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }

  function formatIsoDateForDisplay(value) {
    const parsed = parseIsoDate(value);
    if (!parsed) return "";
    return `${padDatePart(parsed.month)}/${padDatePart(parsed.day)}/${parsed.year}`;
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
    const closeButton = options.closeButton;
    const clearButton = options.clearButton;
    const selectedLabel = options.selectedLabel;
    const applyButton = options.applyButton;
    if (!valueInput || !displayInput || !trigger || !modal || !grid || !title) return null;

    const today = options.today instanceof Date ? options.today : new Date();
    const maxDate = getLocalIsoDate(today);
    const maxYear = today.getFullYear();
    const minYear = Math.max(1, Math.floor(Number(options.minYear || 1900)));
    const ranges = getDobYearRanges({ minYear, maxYear });
    let selectedRange = null;
    let selectedYear = null;
    let selectedMonth = null;
    let selectedDay = null;
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
        selectedDay = parsed.day;
        selectedRange = ranges.find((range) => parsed.year >= range.start && parsed.year <= range.end) || null;
        displayInput.setCustomValidity("");
        if (emit) emitCanonicalChange();
      } else if (!valueInput.value) {
        displayInput.value = "";
        selectedYear = null;
        selectedMonth = null;
        selectedDay = null;
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
      selectedDay = parsed.day;
      selectedRange = ranges.find((range) => parsed.year >= range.start && parsed.year <= range.end) || null;
      updateSelectedLabel();
      return true;
    }

    function renderWheelPicker() {
      title.textContent = "Select date of birth";
      grid.className = "dob-picker-grid dob-picker-columns";
      const yearMarkup = Array.from({ length: maxYear - minYear + 1 }, (_, index) => maxYear - index)
        .map((year) => `<button type="button" class="dob-choice${year === selectedYear ? " is-selected" : ""}" data-dob-choice="year" data-value="${year}" aria-pressed="${year === selectedYear}">${year}</button>`)
        .join("");
      const monthMarkup = MONTH_NAMES.map((name, index) => {
        const month = index + 1;
        return `<button type="button" class="dob-choice${month === selectedMonth ? " is-selected" : ""}" data-dob-choice="month" data-value="${month}" aria-pressed="${month === selectedMonth}">${name}</button>`;
      }).join("");
      const dayYear = selectedYear || maxYear;
      const dayMonth = selectedMonth || 1;
      const dayMarkup = Array.from({ length: getDaysInMonth(dayYear, dayMonth) }, (_, index) => index + 1)
        .map((day) => `<button type="button" class="dob-choice${day === selectedDay ? " is-selected" : ""}" data-dob-choice="day" data-value="${day}" aria-pressed="${day === selectedDay}">${padDatePart(day)}</button>`)
        .join("");
      grid.innerHTML = `
        <section class="dob-picker-column"><h4>Month</h4><div class="dob-picker-scroll" data-dob-column="month">${monthMarkup}</div></section>
        <section class="dob-picker-column"><h4>Day</h4><div class="dob-picker-scroll" data-dob-column="day">${dayMarkup}</div></section>
        <section class="dob-picker-column"><h4>Year</h4><div class="dob-picker-scroll" data-dob-column="year">${yearMarkup}</div></section>`;
      requestAnimationFrame(() => {
        grid.querySelectorAll(".dob-picker-scroll").forEach((column) => {
          const selected = column.querySelector(".dob-choice.is-selected");
          if (selected) selected.scrollIntoView({ block: "center" });
          else column.scrollTop = 0;
        });
      });
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
      const numberOfDays = getDaysInMonth(selectedYear, selectedMonth);
      const current = getSelectedDateParts();
      const dayMarkup = Array.from({ length: numberOfDays }, (_, index) => {
        const day = index + 1;
        const iso = toIsoDate(selectedYear, selectedMonth, day);
        const selected = current?.iso === iso;
        const disabled = iso > maxDate;
        return `<button type="button" class="dob-choice dob-day-choice${selected ? " is-selected" : ""}" data-dob-choice="day" data-value="${day}" aria-label="${MONTH_NAMES[selectedMonth - 1]} ${day}, ${selectedYear}" aria-pressed="${selected ? "true" : "false"}" ${disabled ? "disabled" : ""}>${day}</button>`;
      }).join("");
      grid.innerHTML = dayMarkup;
    }

    function focusFirstChoice() {
      requestAnimationFrame(() => {
        const selected = grid.querySelector(".dob-choice.is-selected:not(:disabled)");
        const first = grid.querySelector(".dob-choice:not(:disabled)");
        (selected || first || closeButton)?.focus();
      });
    }

    function render() {
      renderWheelPicker();
      updateSelectedLabel();
    }

    function open(sourceNode = trigger) {
      const current = getSelectedDateParts();
      if (current) {
        selectedYear = current.year;
        selectedMonth = current.month;
        selectedDay = current.day;
        selectedRange = ranges.find((range) => current.year >= range.start && current.year <= range.end) || null;
      }
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
      selectedDay = null;
      updateCanonicalValue("");
      updateSelectedLabel();
      close();
    }

    trigger.addEventListener("click", () => open(trigger));
    displayInput.addEventListener("input", () => {
      const formattedValue = formatDobInput(displayInput.value);
      if (displayInput.value !== formattedValue) displayInput.value = formattedValue;
      syncFromDisplay({ showError: false });
    });
    displayInput.addEventListener("change", () => syncFromDisplay({ showError: true }));
    displayInput.addEventListener("blur", () => syncFromDisplay({ showError: Boolean(displayInput.value.trim()) }));
    displayInput.addEventListener("invalid", () => syncFromDisplay({ showError: true }));
    closeButton?.addEventListener("click", () => close());
    clearButton?.addEventListener("click", clearDate);
    applyButton?.addEventListener("click", () => {
      const iso = toIsoDate(selectedYear, selectedMonth, selectedDay);
      if (!iso || !isDobWithinBounds(iso, { minYear, maxDate })) return;
      displayInput.value = formatIsoDateForDisplay(iso);
      displayInput.setCustomValidity("");
      updateCanonicalValue(iso);
      updateSelectedLabel();
      close();
    });
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
      if (choice === "year") {
        selectedYear = Number(button.dataset.value);
      } else if (choice === "month") {
        selectedMonth = Number(button.dataset.value);
      } else if (choice === "day") {
        selectedDay = Number(button.dataset.value);
      }
      const maxDay = getDaysInMonth(selectedYear || maxYear, selectedMonth || 1);
      if (selectedDay > maxDay) selectedDay = maxDay;
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
    formatDobInput,
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
