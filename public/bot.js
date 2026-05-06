const mount = document.getElementById("publicBotMount");
const publicId = document.querySelector(".public-bot-shell")?.dataset.publicFormId;

let form = null;
let currentQuestionIndex = 0;
let answers = {};

async function init() {
  mount.innerHTML = '<div class="chat-container"><div class="chat-messages" id="chatMessages"></div><div class="chat-input-area" id="chatInputArea"></div></div>';
  
  try {
    const res = await fetch("/api/public/forms/" + publicId);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load form.");
    
    form = data.form;
    
    appendBotMessage(`<strong>${form.title}</strong><br/>${form.description || "Let's get started!"}`);
    setTimeout(askNextQuestion, 1000);
  } catch (err) {
    if (err.message && err.message.includes("no longer accepting")) {
      mount.innerHTML = '<div class="empty-state">This form is no longer accepting new responses.</div>';
    } else {
      mount.innerHTML = `<div class="empty-state">${err.message}</div>`;
    }
  }
}

function appendBotMessage(html) {
  const msg = document.createElement("div");
  msg.className = "chat-bubble bot-bubble";
  msg.innerHTML = html;
  document.getElementById("chatMessages").appendChild(msg);
  scrollToBottom();
}

function appendUserMessage(text) {
  const msg = document.createElement("div");
  msg.className = "chat-bubble user-bubble";
  msg.textContent = text;
  document.getElementById("chatMessages").appendChild(msg);
  scrollToBottom();
}

function scrollToBottom() {
  const msgs = document.getElementById("chatMessages");
  msgs.scrollTop = msgs.scrollHeight;
}

function askNextQuestion() {
  if (currentQuestionIndex >= form.questions.length) {
    submitForm();
    return;
  }
  
  const question = form.questions[currentQuestionIndex];
  const requiredMark = question.required ? '<span class="required-mark" style="color:#982b18;">*</span>' : "";
  appendBotMessage(`${question.label} ${requiredMark}`);
  
  setTimeout(() => renderInput(question), 300);
}

function renderInput(question) {
  const inputArea = document.getElementById("chatInputArea");
  inputArea.innerHTML = "";
  
  if (question.type === "multiple_choice" || question.type === "dropdown") {
    const wrapper = document.createElement("div");
    wrapper.className = "chat-options-wrapper";
    question.options.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "button button-secondary chat-option-btn";
      btn.textContent = opt;
      btn.onclick = () => handleAnswer(opt, opt);
      wrapper.appendChild(btn);
    });
    inputArea.appendChild(wrapper);
  } else if (question.type === "checkboxes") {
    const wrapper = document.createElement("div");
    wrapper.className = "chat-options-wrapper";
    
    const selected = new Set();
    question.options.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "button button-secondary chat-option-btn";
      btn.textContent = opt;
      btn.onclick = () => {
        if (selected.has(opt)) {
          selected.delete(opt);
          btn.classList.remove("selected");
        } else {
          selected.add(opt);
          btn.classList.add("selected");
        }
      };
      wrapper.appendChild(btn);
    });
    
    const submitBtn = document.createElement("button");
    submitBtn.className = "button button-primary";
    submitBtn.textContent = "Confirm Selection";
    submitBtn.onclick = () => {
      if (question.required && selected.size === 0) {
        alert("Please select at least one option.");
        return;
      }
      handleAnswer(Array.from(selected), Array.from(selected).join(", "));
    };
    wrapper.appendChild(submitBtn);
    inputArea.appendChild(wrapper);
  } else if (question.type === "image") {
    inputArea.innerHTML = `
      <div class="chat-file-input">
        <input type="file" id="chatFileInput" accept="image/jpeg,image/jpg" />
        <button class="button button-primary" id="chatFileBtn">Upload Image</button>
      </div>
    `;
    document.getElementById("chatFileBtn").onclick = async () => {
      const fileInput = document.getElementById("chatFileInput");
      const file = fileInput.files[0];
      if (!file && question.required) {
        alert("Please select an image.");
        return;
      }
      if (!file) {
        handleAnswer("", "(No image)");
        return;
      }
      if (!file.name.toLowerCase().match(/\.jpe?g$/)) {
        alert("Must be a JPG/JPEG image.");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert("Image must be under 5MB.");
        return;
      }
      
      appendBotMessage("Uploading image...");
      inputArea.innerHTML = "";
      
      const formData = new FormData();
      formData.append("file", file);
      
      try {
        const res = await fetch("/api/upload/image", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        
        handleAnswer(data.url, "Uploaded Image: " + file.name);
      } catch (err) {
        alert("Upload failed: " + err.message);
        renderInput(question); // retry
      }
    };
  } else {
    // text, paragraph, phone, number, email, address
    const isMultiline = question.type === "paragraph" || question.type === "address";
    const typeAttr = question.type === "phone" ? "tel" : (question.type === "email" ? "email" : (question.type === "number" ? "number" : "text"));
    
    const inputHtml = isMultiline 
      ? `<textarea id="chatTextInput" rows="2" placeholder="Type your answer..."></textarea>`
      : `<input type="${typeAttr}" id="chatTextInput" placeholder="Type your answer..." />`;
      
    inputArea.innerHTML = `
      <form id="chatInputForm" class="chat-text-input">
        ${inputHtml}
        <button type="submit" class="button button-primary">Send</button>
      </form>
    `;
    
    const inputEl = document.getElementById("chatTextInput");
    inputEl.focus();
    
    document.getElementById("chatInputForm").onsubmit = (e) => {
      e.preventDefault();
      const val = inputEl.value.trim();
      if (question.required && !val) {
        alert("This field is required.");
        return;
      }
      
      if (val && question.type === "phone" && !/^[6789]\d{9}$/.test(val)) {
        alert("Please enter a valid 10-digit number starting with 6-9.");
        return;
      }
      if (val && question.type === "address" && val.length > 500) {
        alert("Address cannot exceed 500 characters.");
        return;
      }
      
      handleAnswer(val, val || "(Skipped)");
    };
  }
}

function handleAnswer(actualValue, displayValue) {
  const qId = form.questions[currentQuestionIndex].id;
  answers[qId] = actualValue;
  
  appendUserMessage(displayValue);
  document.getElementById("chatInputArea").innerHTML = ""; // clear input
  
  currentQuestionIndex++;
  setTimeout(askNextQuestion, 600);
}

async function submitForm() {
  appendBotMessage("Submitting your details...");
  try {
    const res = await fetch("/api/public/forms/" + publicId + "/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    appendBotMessage("<strong>Successfully Submitted!</strong><br/>Thank you, your response has been recorded.");
  } catch (err) {
    appendBotMessage("<strong>Error:</strong> " + err.message);
    const inputArea = document.getElementById("chatInputArea");
    inputArea.innerHTML = `<button class="button button-primary" id="chatRetryBtn">Retry Submit</button>`;
    document.getElementById("chatRetryBtn").onclick = () => {
      inputArea.innerHTML = "";
      submitForm();
    };
  }
}

init();
