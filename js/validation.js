(function (root) {
  "use strict";

  function messageFor(input) {
    const value = input.value.trim();
    if (input.required && !value) return "This field is required.";
    if (value && input.type === "number") {
      const number = Number(value);
      if (!Number.isFinite(number)) return "Enter a valid number.";
      if (input.min !== "" && number < Number(input.min)) return "Must be at least " + input.min + ".";
      if (input.max !== "" && number > Number(input.max)) return "Must be no more than " + input.max + ".";
    }
    if (value && input.type === "date" && Number.isNaN(Date.parse(value))) return "Enter a valid date.";
    return "";
  }

  root.ProjectValidation = Object.freeze({
    required(value) { return String(value || "").trim().length > 0; },
    nonNegative(value) { return Number.isFinite(Number(value)) && Number(value) >= 0; },
    positive(value) { return Number.isFinite(Number(value)) && Number(value) > 0; },
    percent(value) { return Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100; },
    dateOrder(start, end) { return !start || !end || start <= end; },
    uniqueName(value, rows, currentId, key) {
      const normalized = String(value || "").trim().toLowerCase();
      return !rows.some(function (row) { return row.id !== currentId && String(row[key] || "").trim().toLowerCase() === normalized; });
    },
    validateForm(form) {
      let valid = true;
      form.querySelectorAll("[name]").forEach(function (input) {
        const error = form.querySelector('[data-error-for="' + CSS.escape(input.name) + '"]');
        if (!error) return;
        const message = messageFor(input);
        error.textContent = message;
        input.classList.toggle("input-error", Boolean(message));
        if (message) valid = false;
      });
      return valid;
    },
    clearError(input) {
      input.classList.remove("input-error");
      const error = input.form && input.form.querySelector('[data-error-for="' + CSS.escape(input.name) + '"]');
      if (error) error.textContent = "";
    }
  });
}(window));
