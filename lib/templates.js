import { escapeHtml } from "./utils.js";

function renderLayout({ title, body, pageClass = "" }) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body class="${escapeHtml(pageClass)}">
    ${body}
  </body>
</html>`;
}

export function renderLoginPage(error = "") {
  return renderLayout({
    title: "Admin Login | Finix Printing",
    pageClass: "plain-page",
    body: `
      <main class="plain-shell login-shell">
        <div class="login-brand">
          <span class="brand-mark">FP</span>
          <span class="brand-text">Finix Printing</span>
        </div>
        <p class="eyebrow">Admin access</p>
        <h1>Sign in to continue</h1>
        <p class="hero-copy">Enter your credentials to access the form dashboard.</p>

        ${error ? `<p class="login-error">${escapeHtml(error)}</p>` : ""}

        <form method="POST" action="/login" class="login-form">
          <label class="field">
            <span>Username</span>
            <input type="text" name="username" autocomplete="username" required autofocus />
          </label>
          <label class="field">
            <span>Password</span>
            <input type="password" name="password" autocomplete="current-password" required />
          </label>
          <button class="button button-primary" type="submit" style="width:100%;margin-top:8px;">Sign In</button>
        </form>
      </main>
    `
  });
}

export function renderLandingPage(site) {
  const businessName = escapeHtml(site.businessName);
  const whatsappUrl = escapeHtml(site.whatsappUrl);
  const instagramUrl = escapeHtml(site.instagramUrl);
  const facebookUrl = escapeHtml(site.facebookUrl);

  return renderLayout({
    title: `${site.businessName} | Bulk Printing & Student Forms`,
    pageClass: "landing-page",
    body: `
      <div class="landing-background"></div>
      <header class="site-header">
        <a class="brand-lockup" href="/">
          <span class="brand-mark">FP</span>
          <span class="brand-text">${businessName}</span>
        </a>
        <nav class="site-nav">
          <a href="#services">Services</a>
          <a href="#contact">Booking</a>
        </nav>
      </header>

      <main class="landing-shell">
        <section class="hero-panel">
          <p class="eyebrow">Printing for schools, institutes, and businesses</p>
          <h1>${businessName} manages bulk printing and student data collection in one place.</h1>
          <p class="hero-copy">${escapeHtml(site.tagline)}</p>
          <div class="hero-actions">
            <a class="button button-secondary" href="#contact">Book Printing Work</a>
          </div>
          <div class="hero-notes">
            <span>Bulk print jobs</span>
            <span>School-ready forms</span>
            <span>Excel exports</span>
          </div>
        </section>

        <aside class="contact-stack" id="contact">
          <section class="info-card highlight-card">
            <p class="card-label">Book your print work</p>
            <h2>${businessName}</h2>
            <p>${escapeHtml(site.bookingNote)}</p>
            <div class="contact-list">
              <a href="tel:${escapeHtml(site.phone)}">${escapeHtml(site.phone)}</a>
              <a href="mailto:${escapeHtml(site.email)}">${escapeHtml(site.email)}</a>
              <span>${escapeHtml(site.address)}</span>
            </div>
          </section>

          <section class="info-card">
            <p class="card-label">Social media</p>
            <div class="social-links">
              <a href="${whatsappUrl}" target="_blank" rel="noreferrer">WhatsApp Booking</a>
              <a href="${instagramUrl}" target="_blank" rel="noreferrer">Instagram</a>
              <a href="${facebookUrl}" target="_blank" rel="noreferrer">Facebook</a>
            </div>
          </section>
        </aside>

        <section class="services-panel" id="services">
          <div class="section-heading">
            <p class="eyebrow">What we handle</p>
            <h2>Designed for heavy-volume print work and student record collection.</h2>
          </div>
          <div class="services-grid">
            <article class="service-card">
              <h3>School Bulk Orders</h3>
              <p>Answer sheets, report cards, certificates, exam packs, notebooks, and classroom print kits.</p>
            </article>
            <article class="service-card">
              <h3>Business Printing</h3>
              <p>Brochures, flyers, invoices, forms, letterheads, product labels, and branded handouts.</p>
            </article>
            <article class="service-card">
              <h3>Student Form Collection</h3>
              <p>Create a shareable form, collect responses online, and download student details in Excel format.</p>
            </article>
          </div>
        </section>

        <section class="promo-band">
          <div>
            <p class="eyebrow">Workflow</p>
            <h2>Build your own school intake form like Google Forms, then share only the response link.</h2>
          </div>
          <div class="promo-steps">
            <span>Create custom questions</span>
            <span>Mark important fields</span>
            <span>Share a student-only link</span>
            <span>Download completed responses</span>
          </div>
        </section>
      </main>
    `
  });
}

export function renderDashboardPage(site) {
  return renderLayout({
    title: `${site.businessName} | Form Dashboard`,
    pageClass: "dashboard-page",
    body: `
      <div class="dashboard-shell">
        <aside class="dashboard-sidebar">
          <div class="sidebar-brand">
            <span class="brand-mark">FP</span>
            <div>
              <p class="sidebar-title">${escapeHtml(site.businessName)}</p>
              <p class="sidebar-subtitle">Print + forms dashboard</p>
            </div>
          </div>

          <button class="sidebar-link" data-section="overview">Overview</button>
          <button class="sidebar-link" data-section="create-form">Create Form</button>
          <button class="sidebar-link" data-section="responses">Responses</button>

          <div class="sidebar-note">
            <p>Share only the generated student form link. The dashboard stays private on your main website.</p>
          </div>

          <a href="/logout" class="sidebar-link" style="margin-top:auto;display:block;text-align:center;color:rgba(255,255,255,0.7);">Sign Out</a>
        </aside>

        <main class="dashboard-content">
          <section class="dashboard-hero" id="overview">
            <div>
              <p class="eyebrow">Admin panel</p>
              <h1>Build forms for schools and download every response in Excel-ready format.</h1>
              <p class="hero-copy">Create questions, mark fields as required, collect entries from students, and review all submissions in one place.</p>
            </div>
            <a class="button button-secondary" href="/">Back to Homepage</a>
          </section>

          <section class="stats-grid">
            <article class="stat-card">
              <p>Total Forms</p>
              <strong id="totalFormsStat">0</strong>
            </article>
            <article class="stat-card">
              <p>Total Responses</p>
              <strong id="totalResponsesStat">0</strong>
            </article>
            <article class="stat-card">
              <p>Latest Form</p>
              <strong id="latestFormStat">No forms yet</strong>
            </article>
          </section>

          <section class="dashboard-panel" id="create-form">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Create form</p>
                <h2>Set the form title, add questions, and generate a shareable student link.</h2>
              </div>
              <button class="button button-secondary" id="addQuestionButton" type="button">Add Question</button>
            </div>

            <form id="builderForm" class="builder-form">
              <label class="field">
                <span>Form title</span>
                <input type="text" id="formTitle" name="title" placeholder="Student Details Collection" required />
              </label>

              <label class="field">
                <span>Description</span>
                <textarea id="formDescription" name="description" rows="3" placeholder="Tell students or schools what details you need."></textarea>
              </label>

              <div id="questionList" class="question-list"></div>

              <div class="builder-actions">
                <p class="status-text" id="builderStatus">Add your questions and create the form.</p>
                <button class="button button-primary" type="submit">Generate Form Link</button>
              </div>
            </form>
          </section>

          <section class="dashboard-panel" id="responses">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Forms and responses</p>
                <h2>Review each form, copy its public link, and export completed student data.</h2>
              </div>
            </div>

            <div class="forms-grid">
              <div class="forms-column">
                <h3>Saved Forms</h3>
                <div id="formsList" class="forms-list"></div>
              </div>

              <div class="responses-column">
                <div id="responsesSummary" class="responses-summary empty-state">
                  Select a form to view submissions.
                </div>
                <div id="responsesTableWrap" class="responses-table-wrap"></div>
              </div>
            </div>
          </section>
        </main>
      </div>

      <script src="/admin.js" defer></script>
    `
  });
}

export function renderPublicFormPage(site, publicId) {
  return renderLayout({
    title: `${site.businessName} | Student Form`,
    pageClass: "public-form-page",
    body: `
      <main class="public-form-shell" data-public-form-id="${escapeHtml(publicId)}">
        <header class="public-form-header">
          <p class="eyebrow">${escapeHtml(site.businessName)}</p>
          <h1>Student details form</h1>
          <p class="hero-copy">Fill the required information below. Your response will go directly to ${escapeHtml(site.businessName)}.</p>
        </header>

        <section id="publicFormMount" class="public-form-card">
          <p class="empty-state">Loading form...</p>
        </section>
      </main>

      <script src="/form.js" defer></script>
    `
  });
}

export function renderNotFoundPage() {
  return renderLayout({
    title: "Page not found",
    pageClass: "plain-page",
    body: `
      <main class="plain-shell">
        <h1>Page not found</h1>
        <p>The page or form you requested could not be found.</p>
        <a class="button button-primary" href="/">Go to homepage</a>
      </main>
    `
  });
}
