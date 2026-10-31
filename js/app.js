(function (root) {
  "use strict";

  const views = {
    dashboard: "Dashboard",
    initiation: "Initiation & integration",
    scope: "Scope & WBS",
    schedule: "Schedule & resources",
    cost: "Cost & earned value",
    quality: "Quality & risk"
  };
  let activeView = "dashboard";
  const escapeHtml = function (value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  };
  const money = function (value) {
    return "PKR " + new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(Number(value) || 0);
  };
  const date = function (value) {
    if (!value) return "—";
    const parsed = new Date(String(value).slice(0, 10) + "T00:00:00");
    return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };
  const badge = function (value) {
    const className = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return '<span class="status ' + escapeHtml(className) + '">' + escapeHtml(value || "Not set") + "</span>";
  };
  const button = function (label, action, id, kind) {
    return '<button class="button ' + (kind || "button-secondary") + ' button-small" data-action="' + escapeHtml(action) + '" data-id="' + escapeHtml(id) + '">' + escapeHtml(label) + "</button>";
  };
  const editDelete = function (id) {
    return '<div class="actions-cell">' + button("Edit", "edit", id, "button-secondary") +
      '<button class="button button-danger button-small" data-action="delete" data-id="' + escapeHtml(id) + '">Delete</button></div>';
  };
  const empty = function (message) {
    return '<div class="empty-state">' + escapeHtml(message) + "</div>";
  };
  const heading = function (eyebrow, title, subtitle, actions) {
    return '<div class="page-heading"><div><p class="eyebrow">' + escapeHtml(eyebrow) + "</p><h1>" +
      escapeHtml(title) + '</h1><p class="page-subtitle">' + escapeHtml(subtitle) +
      '</p></div><div class="heading-actions">' + (actions || "") + "</div></div>";
  };
  const card = function (title, body, options) {
    options = options || {};
    return '<article class="card ' + escapeHtml(options.className || "") + '"><div class="card-header"><div><h2 class="card-title">' +
      escapeHtml(title) + '</h2>' + (options.description ? '<p class="card-description">' + escapeHtml(options.description) + "</p>" : "") +
      '</div>' + (options.action || "") + '</div><div class="card-body">' + body + "</div></article>";
  };
  const table = function (headers, rows) {
    return '<div class="table-wrap"><table><thead><tr>' + headers.map(function (header) {
      return "<th>" + escapeHtml(header) + "</th>";
    }).join("") + "</tr></thead><tbody>" + (rows.length ? rows.join("") : '<tr><td colspan="' + headers.length + '">' + empty("No records yet.") + "</td></tr>") + "</tbody></table></div>";
  };

  function toast(message, isError) {
    const region = document.getElementById("toast-region");
    const item = document.createElement("div");
    item.className = "toast" + (isError ? " error" : "");
    item.textContent = message;
    region.appendChild(item);
    window.setTimeout(function () { item.remove(); }, 4000);
  }

  function apiCall(method, tableName, id, values) {
    if (method === "getAll") return root.ProjectAPI.getAll(tableName);
    if (method === "getById") return root.ProjectAPI.getById(tableName, id);
    try {
      const operation = method === "add" ? root.ProjectAPI.add(tableName, id)
        : method === "update" ? root.ProjectAPI.update(tableName, id, values)
          : root.ProjectAPI.remove(tableName, id);
      return Promise.resolve(operation).then(async function (result) {
        await root.ProjectAPI.refresh();
        renderActive();
        return result;
      }).catch(function (error) {
        toast(error.message || "The project server could not complete this request.", true);
        throw error;
      });
    } catch (error) {
      toast(error.message || "The project server could not complete this request.", true);
      throw error;
    }
  }

  function renderActive() {
    const module = root.ProjectModules && root.ProjectModules[activeView];
    const target = document.getElementById("view-" + activeView);
    if (!module || !target) return;
    try {
      module.render(target);
    } catch (error) {
      console.error("Module rendering failed:", error);
      target.innerHTML = '<div class="banner danger"><div><strong>This section could not be displayed.</strong>Reload the page after checking that project data is available.</div></div>';
    }
  }

  function fieldMarkup(field, initial) {
    const value = initial[field.name] == null ? field.value == null ? "" : field.value : initial[field.name];
    const required = field.required ? " required" : "";
    const min = field.min == null ? "" : ' min="' + escapeHtml(field.min) + '"';
    const max = field.max == null ? "" : ' max="' + escapeHtml(field.max) + '"';
    const step = field.step == null ? "" : ' step="' + escapeHtml(field.step) + '"';
    const multiple = field.multiple ? " multiple" : "";
    let control;
    if (field.type === "select") {
      const selected = Array.isArray(value) ? value : [String(value)];
      control = '<select id="field-' + escapeHtml(field.name) + '" name="' + escapeHtml(field.name) + '"' + required + multiple + '><option value="">Select…</option>' +
        (field.options || []).map(function (option) {
          const optionValue = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;
          return '<option value="' + escapeHtml(optionValue) + '"' + (selected.indexOf(String(optionValue)) >= 0 ? " selected" : "") + ">" + escapeHtml(optionLabel) + "</option>";
        }).join("") + "</select>";
      if (field.multiple) control = control.replace('<option value="">Select…</option>', "");
    } else if (field.type === "textarea") {
      control = '<textarea id="field-' + escapeHtml(field.name) + '" name="' + escapeHtml(field.name) + '"' + required + ">" + escapeHtml(value) + "</textarea>";
    } else {
      control = '<input id="field-' + escapeHtml(field.name) + '" type="' + escapeHtml(field.type || "text") + '" name="' + escapeHtml(field.name) +
        '" value="' + escapeHtml(value) + '"' + required + min + max + step + (field.placeholder ? ' placeholder="' + escapeHtml(field.placeholder) + '"' : "") + ">";
    }
    return '<div class="form-field ' + (field.full ? "full" : "") + '"><label for="field-' + escapeHtml(field.name) + '">' +
      escapeHtml(field.label) + (field.required ? " *" : "") + "</label>" + control +
      '<span class="field-error" data-error-for="' + escapeHtml(field.name) + '"></span>' +
      (field.help ? '<small class="muted">' + escapeHtml(field.help) + "</small>" : "") + "</div>";
  }

  function openForm(options) {
    const dialog = document.getElementById("app-dialog");
    const content = document.getElementById("dialog-content");
    const initial = options.initial || {};
    content.innerHTML = '<div class="dialog-header"><h2>' + escapeHtml(options.title) +
      '</h2><button type="button" class="dialog-close" aria-label="Close">×</button></div><form class="dialog-form" novalidate>' +
      '<p class="inline-error" aria-live="polite"></p><div class="field-grid">' +
      options.fields.map(function (field) { return fieldMarkup(field, initial); }).join("") +
      '</div><div class="dialog-footer"><button type="button" class="button button-secondary" data-cancel>Cancel</button>' +
      '<button type="submit" class="button">' + escapeHtml(options.submitLabel || "Save changes") + "</button></div></form>";
    const form = content.querySelector("form");
    content.querySelectorAll("[name]").forEach(function (input) {
      input.addEventListener("input", function () { root.ProjectValidation.clearError(input); });
      input.addEventListener("change", function () { root.ProjectValidation.clearError(input); });
    });
    content.querySelector(".dialog-close").addEventListener("click", function () { dialog.close(); });
    content.querySelector("[data-cancel]").addEventListener("click", function () { dialog.close(); });
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!root.ProjectValidation.validateForm(form)) return;
      const values = {};
      new FormData(form).forEach(function (value, key) {
        const input = form.elements.namedItem(key);
        if (input && input.multiple) {
          values[key] = Array.from(input.selectedOptions).map(function (option) { return option.value; });
        } else if (input && input.type === "number") {
          values[key] = value === "" ? "" : Number(value);
        } else {
          values[key] = String(value).trim();
        }
      });
      const message = options.validate ? options.validate(values) : "";
      if (message) {
        form.querySelector(".inline-error").textContent = message;
        return;
      }
      try {
        const submitButton = form.querySelector('[type="submit"]');
        submitButton.disabled = true;
        const result = await options.onSubmit(values);
        if (result === false) return;
        dialog.close();
        toast(options.successMessage || "Changes saved.");
        renderActive();
      } catch (error) {
        console.error("Form submission failed:", error);
        form.querySelector(".inline-error").textContent = error.message || "Changes could not be saved. Please try again.";
        toast(error.message || "Changes could not be saved.", true);
      } finally {
        const submitButton = form.querySelector('[type="submit"]');
        if (submitButton) submitButton.disabled = false;
      }
    });
    if (!dialog.open) dialog.showModal();
  }

  async function init() {
    document.querySelectorAll(".nav-item").forEach(function (item) {
      item.addEventListener("click", function () {
        activeView = item.dataset.view;
        document.querySelectorAll(".nav-item").forEach(function (nav) { nav.classList.toggle("active", nav === item); });
        document.querySelectorAll(".view-section").forEach(function (section) { section.classList.toggle("active", section.id === "view-" + activeView); });
        document.getElementById("page-breadcrumb").textContent = views[activeView];
        renderActive();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
    root.ProjectModules = root.ProjectModules || {};
    try {
      await root.ProjectAPI.bootstrap();
      renderActive();
    } catch (error) {
      console.error("Project data could not be loaded:", error);
      document.getElementById("view-dashboard").innerHTML =
        '<div class="banner danger"><div><strong>Project data is unavailable.</strong>' +
        escapeHtml(error.message || "Start the backend, run the sample-data seed and refresh.") + "</div></div>";
      toast(error.message || "Project data could not be loaded.", true);
    }
  }

  function goTo(name) {
    const item = document.querySelector('.nav-item[data-view="' + CSS.escape(name) + '"]');
    if (item) item.click();
  }

  root.App = Object.freeze({
    escape: escapeHtml, money: money, date: date, badge: badge, button: button, editDelete: editDelete,
    empty: empty, heading: heading, card: card, table: table, toast: toast, openForm: openForm,
    getAll: function (tableName) { return apiCall("getAll", tableName); },
    getById: function (tableName, id) { return apiCall("getById", tableName, id); },
    add: function (tableName, values) { return apiCall("add", tableName, values); },
    update: function (tableName, id, values) { return apiCall("update", tableName, id, values); },
    remove: function (tableName, id) { return apiCall("remove", tableName, id); },
    refresh: renderActive, goTo: goTo,
    register: function (name, module) { root.ProjectModules = root.ProjectModules || {}; root.ProjectModules[name] = module; },
    headingViews: views
  });
  document.addEventListener("DOMContentLoaded", init);
}(window));
