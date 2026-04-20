const mount = document.getElementById("publicFormMount");
const publicId = document.querySelector(".public-form-shell")?.dataset.publicFormId;

const typeHelp = {
  short_text: "Short answer",
  paragraph: "Long answer",
  multiple_choice: "Select one option",
  checkboxes: "Select one or more options",
  dropdown: "Choose from the list",
  date: "Select a date",
  number: "Enter a number",
  email: "Enter an email address"
};

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
    throw new Error(data.error || "Unable to load the form.");
  }
  return data;
}

function renderField(question) {
  const requiredMark = question.required ? '<span class="required-mark">*</span>' : "";

  if (question.type === "paragraph") {
    return '<label class="field"><span>' + question.label + ' ' + requiredMark + '</span><textarea name="' + question.id + '" rows="4" ' + (question.required ? "required" : "") + '></textarea></label>';
  }

  if (question.type === "multiple_choice") {
    const opts = question.options.map(option => '<label class="choice-option"><input type="radio" name="' + question.id + '" value="' + option + '" ' + (question.required ? "required" : "") + ' /><span>' + option + '</span></label>').join("");
    return '<fieldset class="choice-group"><legend>' + question.label + ' ' + requiredMark + '</legend><p class="field-help">' + typeHelp[question.type] + '</p>' + opts + '</fieldset>';
  }

  if (question.type === "checkboxes") {
    const opts = question.options.map(option => '<label class="choice-option"><input type="checkbox" name="' + question.id + '" value="' + option + '" /><span>' + option + '</span></label>').join("");
    return '<fieldset class="choice-group"><legend>' + question.label + ' ' + requiredMark + '</legend><p class="field-help">' + typeHelp[question.type] + '</p>' + opts + '</fieldset>';
  }

  if (question.type === "dropdown") {
    const opts = question.options.map(option => '<option value="' + option + '">' + option + '</option>').join("");
    return '<label class="field"><span>' + question.label + ' ' + requiredMark + '</span><select name="' + question.id + '" ' + (question.required ? "required" : "") + '><option value="">Select an option</option>' + opts + '</select></label>';
  }

  return '<label class="field"><span>' + question.label + ' ' + requiredMark + '</span><input type="' + (question.type === "short_text" ? "text" : question.type) + '" name="' + question.id + '" ' + (question.required ? "required" : "") + ' /><small class="field-help">' + typeHelp[question.type] + '</small></label>';
}

function collectAnswers(form, questions) {
  const answers = {};
  for (const question of questions) {
    if (question.type === "checkboxes") {
      answers[question.id] = [...form.querySelectorAll('input[name="' + question.id + '"]:checked')].map(input => input.value);
      continue;
    }
    const field = form.querySelector('[name="' + question.id + '"]');
    answers[question.id] = field?.value ?? "";
  }
  return answers;
}

function showSuccessScreen(formTitle) {
  mount.innerHTML = '<div class="submit-success"><div class="success-icon">&#10003;</div><h2>Successfully Submitted!</h2><p>Your details have been recorded for <strong>' + formTitle + '</strong>. Thank you!</p><button class="button button-primary" id="newResponseBtn" type="button">Submit Another Response</button></div>';
  document.getElementById("newResponseBtn").addEventListener("click", () => { loadForm(); });
}

async function loadForm() {
  mount.innerHTML = '<p class="empty-state">Loading form...</p>';
  try {
    const data = await apiFetch("/api/public/forms/" + publicId);
    const { form } = data;
    const questionsHtml = form.questions.map(question => '<div class="public-question">' + renderField(question) + '</div>').join("");
    mount.innerHTML = '<div class="public-form-intro"><p class="eyebrow">Shareable form</p><h2>' + form.title + '</h2><p>' + (form.description || "Please complete all required details below.") + '</p></div><form id="publicForm" class="public-form-fields">' + questionsHtml + '<div class="builder-actions"><p class="status-text" id="publicFormStatus">Fields marked with * are required.</p><button class="button button-primary" type="submit">Submit Form</button></div></form>';

    const formElement = document.getElementById("publicForm");
    const status = document.getElementById("publicFormStatus");

    formElement.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "Submitting your details...";
      status.dataset.tone = "loading";
      try {
        const answers = collectAnswers(formElement, form.questions);
        await apiFetch("/api/public/forms/" + publicId + "/responses", {
          method: "POST",
          body: JSON.stringify({ answers })
        });
        showSuccessScreen(form.title);
      } catch (error) {
        status.textContent = error.message;
        status.dataset.tone = "error";
      }
    });
  } catch (error) {
    mount.innerHTML = '<div class="empty-state">' + error.message + '</div>';
  }
}

loadForm();
