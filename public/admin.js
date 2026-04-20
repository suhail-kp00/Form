const state = {
  forms: [],
  selectedFormId: null,
  questionCounter: 0
};

const refs = {
  builderForm: document.getElementById("builderForm"),
  formTitle: document.getElementById("formTitle"),
  formDescription: document.getElementById("formDescription"),
  questionList: document.getElementById("questionList"),
  addQuestionButton: document.getElementById("addQuestionButton"),
  builderStatus: document.getElementById("builderStatus"),
  formsList: document.getElementById("formsList"),
  responsesSummary: document.getElementById("responsesSummary"),
  responsesTableWrap: document.getElementById("responsesTableWrap"),
  totalFormsStat: document.getElementById("totalFormsStat"),
  totalResponsesStat: document.getElementById("totalResponsesStat"),
  latestFormStat: document.getElementById("latestFormStat")
};

const typeLabels = {
  short_text: "Short answer",
  paragraph: "Paragraph",
  multiple_choice: "Multiple choice",
  checkboxes: "Checkboxes",
  dropdown: "Dropdown",
  date: "Date",
  number: "Number",
  email: "Email"
};

function scrollToSection(targetId) {
  const section = document.getElementById(targetId);

  if (section) {
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function setBuilderStatus(message, tone = "neutral") {
  refs.builderStatus.textContent = message;
  refs.builderStatus.dataset.tone = tone;
}

function createQuestionCard(question = {}) {
  state.questionCounter += 1;
  const questionId = question.id || `question_${Date.now()}_${state.questionCounter}`;
  const card = document.createElement("article");
  const selectedType = question.type || "short_text";
  const usesOptions = ["multiple_choice", "checkboxes", "dropdown"].includes(selectedType);

  card.className = "question-card";
  card.dataset.questionId = questionId;
  card.innerHTML = `
    <div class="question-card-top">
      <strong class="question-number">Question</strong>
      <button type="button" class="inline-button danger" data-action="remove-question">Remove</button>
    </div>

    <label class="field">
      <span>Question</span>
      <input
        type="text"
        class="question-label"
        value="${question.label || ""}"
        placeholder="Student full name"
        required
      />
    </label>

    <div class="question-card-grid">
      <label class="field">
        <span>Question type</span>
        <select class="question-type">
          ${Object.entries(typeLabels)
            .map(
              ([value, label]) =>
                `<option value="${value}" ${value === selectedType ? "selected" : ""}>${label}</option>`
            )
            .join("")}
        </select>
      </label>

      <label class="toggle-field">
        <input type="checkbox" class="question-required" ${question.required ? "checked" : ""} />
        <span>Mark as important</span>
      </label>
    </div>

    <label class="field options-field ${usesOptions ? "" : "hidden"}">
      <span>Options</span>
      <textarea class="question-options" rows="4" placeholder="One option per line">${
        Array.isArray(question.options) ? question.options.join("\n") : ""
      }</textarea>
    </label>
  `;

  const typeSelect = card.querySelector(".question-type");
  const optionsField = card.querySelector(".options-field");

  typeSelect.addEventListener("change", () => {
    const showOptions = ["multiple_choice", "checkboxes", "dropdown"].includes(typeSelect.value);
    optionsField.classList.toggle("hidden", !showOptions);
  });

  return card;
}

function refreshQuestionNumbers() {
  const cards = refs.questionList.querySelectorAll(".question-card");

  cards.forEach((card, index) => {
    const number = card.querySelector(".question-number");
    number.textContent = `Question ${index + 1}`;
  });
}

function addQuestion(question) {
  refs.questionList.appendChild(createQuestionCard(question));
  refreshQuestionNumbers();
}

function collectQuestions() {
  return [...refs.questionList.querySelectorAll(".question-card")].map((card) => {
    const optionsText = card.querySelector(".question-options")?.value || "";

    return {
      id: card.dataset.questionId,
      label: card.querySelector(".question-label").value.trim(),
      type: card.querySelector(".question-type").value,
      required: card.querySelector(".question-required").checked,
      options: optionsText
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean)
    };
  });
}

function resetBuilder() {
  refs.builderForm.reset();
  refs.questionList.innerHTML = "";
  addQuestion({
    label: "Student full name",
    type: "short_text",
    required: true
  });
  setBuilderStatus("Add your questions and create the form.", "neutral");
}

function updateStats() {
  const totalForms = state.forms.length;
  const totalResponses = state.forms.reduce((sum, form) => sum + Number(form.responseCount || 0), 0);
  const latestForm = state.forms[0]?.title || "No forms yet";

  refs.totalFormsStat.textContent = String(totalForms);
  refs.totalResponsesStat.textContent = String(totalResponses);
  refs.latestFormStat.textContent = latestForm;
}

function renderFormsList() {
  if (!state.forms.length) {
    refs.formsList.innerHTML = `<div class="empty-state">No forms created yet. Build your first student form above.</div>`;
    return;
  }

  refs.formsList.innerHTML = state.forms
    .map((form) => {
      const isActive = Number(form.id) === Number(state.selectedFormId);

      return `
        <article class="form-card ${isActive ? "active" : ""}">
          <div class="form-card-top">
            <div>
              <h4>${form.title}</h4>
              <p>${form.responseCount} responses</p>
            </div>
            <button type="button" class="inline-button" data-action="view" data-form-id="${form.id}">
              View
            </button>
          </div>

          <div class="form-actions">
            <button type="button" class="inline-button" data-action="copy" data-form-id="${form.id}">
              Copy Link
            </button>
            <a class="inline-button" href="${form.shareLink}" target="_blank" rel="noreferrer">
              Open Form
            </a>
            <a class="inline-button" href="/api/forms/${form.id}/export.xls">
              Download Excel
            </a>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderResponses(bundle) {
  if (!bundle) {
    refs.responsesSummary.className = "responses-summary empty-state";
    refs.responsesSummary.textContent = "Select a form to view submissions.";
    refs.responsesTableWrap.innerHTML = "";
    return;
  }

  const { form, table, responses } = bundle;

  refs.responsesSummary.className = "responses-summary";
  refs.responsesSummary.innerHTML = `
    <div class="summary-top">
      <div>
        <p class="eyebrow">Selected form</p>
        <h3>${form.title}</h3>
        <p>${form.description || "No description added."}</p>
      </div>
      <div class="summary-actions">
        <button type="button" class="button button-secondary" id="copySelectedLink">Copy Public Link</button>
        <a class="button button-primary" href="/api/forms/${form.id}/export.xls">Download Excel</a>
      </div>
    </div>
    <div class="link-pill">${form.shareLink}</div>
    <p class="responses-count">${responses.length} completed student submissions</p>
  `;

  const copyButton = document.getElementById("copySelectedLink");
  copyButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(form.shareLink);
    copyButton.textContent = "Link Copied";
    window.setTimeout(() => {
      copyButton.textContent = "Copy Public Link";
    }, 1500);
  });

  if (!table.rows.length) {
    refs.responsesTableWrap.innerHTML = `<div class="empty-state">No student submissions yet for this form.</div>`;
    return;
  }

  refs.responsesTableWrap.innerHTML = `
    <div class="table-scroll">
      <table class="responses-table">
        <thead>
          <tr>
            ${table.columns.map((column) => `<th>${column.label}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${table.rows
            .map(
              (row) => `
                <tr>
                  <td>${row.submittedAtLabel}</td>
                  ${form.questions
                    .map((question) => `<td>${row.cells[question.id] || "-"}</td>`)
                    .join("")}
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function loadForms(selectedId = state.selectedFormId) {
  const data = await apiFetch("/api/forms");
  state.forms = data.forms;
  renderFormsList();
  updateStats();

  if (selectedId) {
    await loadResponses(selectedId);
  }
}

async function loadResponses(formId) {
  state.selectedFormId = Number(formId);
  renderFormsList();

  const data = await apiFetch(`/api/forms/${formId}/responses`);
  renderResponses(data);
}

async function handleBuilderSubmit(event) {
  event.preventDefault();
  setBuilderStatus("Creating form and generating link...", "loading");

  try {
    const payload = {
      title: refs.formTitle.value.trim(),
      description: refs.formDescription.value.trim(),
      questions: collectQuestions()
    };

    const data = await apiFetch("/api/forms", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    await loadForms(data.form.id);
    resetBuilder();
    scrollToSection("responses");
    setBuilderStatus(`Form created. Share this link: ${data.form.shareLink}`, "success");
  } catch (error) {
    setBuilderStatus(error.message, "error");
  }
}

refs.addQuestionButton.addEventListener("click", () => {
  addQuestion({
    label: "",
    type: "short_text",
    required: false
  });
});

refs.questionList.addEventListener("click", (event) => {
  const action = event.target.dataset.action;

  if (action === "remove-question") {
    event.target.closest(".question-card").remove();
    refreshQuestionNumbers();
  }
});

refs.formsList.addEventListener("click", async (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const action = target.dataset.action;
  const formId = target.dataset.formId;

  if (!action || !formId) {
    return;
  }

  if (action === "view") {
    await loadResponses(formId);
  }

  if (action === "copy") {
    const form = state.forms.find((item) => Number(item.id) === Number(formId));

    if (form) {
      await navigator.clipboard.writeText(form.shareLink);
      target.textContent = "Copied";
      window.setTimeout(() => {
        target.textContent = "Copy Link";
      }, 1500);
    }
  }
});

document.querySelectorAll(".sidebar-link").forEach((button) => {
  button.addEventListener("click", () => {
    scrollToSection(button.dataset.section);
  });
});

refs.builderForm.addEventListener("submit", handleBuilderSubmit);

resetBuilder();
loadForms().catch((error) => {
  setBuilderStatus(error.message, "error");
});
