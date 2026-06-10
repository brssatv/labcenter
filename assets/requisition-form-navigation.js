(function initRequisitionNavigation(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LabCenterRequisitionNavigation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const BLOCKED_INPUT_TYPES = new Set(["hidden", "button", "submit", "reset", "file", "checkbox", "radio"]);

  function isElementLike(element) {
    return Boolean(element && typeof element === "object" && typeof element.tagName === "string");
  }

  function getTagName(element) {
    return String(element?.tagName || "").toLowerCase();
  }

  function isVisibleField(element) {
    if (!isElementLike(element)) return false;
    if (typeof element.closest === "function" && element.closest(".hidden")) return false;
    if (typeof element.getClientRects === "function") {
      const rects = element.getClientRects();
      if (rects && typeof rects.length === "number") {
        return rects.length > 0;
      }
    }
    return true;
  }

  function isAdvanceEligibleField(element) {
    if (!isElementLike(element) || !isVisibleField(element) || Boolean(element.disabled)) return false;

    const tagName = getTagName(element);
    if (tagName === "textarea") return false;

    if (tagName === "input") {
      const inputType = String(element.type || "text").toLowerCase();
      if (BLOCKED_INPUT_TYPES.has(inputType) || Boolean(element.readOnly)) return false;
      return true;
    }

    return tagName === "select";
  }

  function focusField(element) {
    if (!isAdvanceEligibleField(element)) return false;

    if (typeof element.focus === "function") {
      element.focus();
    }

    const tagName = getTagName(element);
    const inputType = String(element?.type || "").toLowerCase();
    if ((tagName === "input" || tagName === "textarea") && !["date", "time"].includes(inputType) && typeof element.select === "function") {
      try {
        element.select();
      } catch {
        // Some browser-managed fields do not support select(); focus is still enough.
      }
    }

    return true;
  }

  function getAdvanceEligibleFields(fields, options = {}) {
    const excludedElements = new Set(Array.isArray(options.excludedElements) ? options.excludedElements.filter(Boolean) : []);
    return (Array.isArray(fields) ? fields : []).filter((element) => !excludedElements.has(element) && isAdvanceEligibleField(element));
  }

  function findNextAdvanceField(fields, currentField, options = {}) {
    const eligibleFields = getAdvanceEligibleFields(fields, options);
    const preferredNextField = options.preferredNextField;
    if (preferredNextField && eligibleFields.includes(preferredNextField)) {
      return preferredNextField;
    }

    const currentIndex = eligibleFields.indexOf(currentField);
    if (currentIndex < 0) return null;
    return eligibleFields[currentIndex + 1] || null;
  }

  function focusNextAdvanceField(fields, currentField, options = {}) {
    const nextField = findNextAdvanceField(fields, currentField, options);
    if (!nextField) return false;
    return focusField(nextField);
  }

  return {
    isAdvanceEligibleField,
    getAdvanceEligibleFields,
    findNextAdvanceField,
    focusField,
    focusNextAdvanceField,
  };
});
