/**
 * Email Security Scanner - Content Script
 * Auto-popup floating panel when on email sites
 */

class EmailSecurityScanner {
  constructor() {
    this.API_ENDPOINT = "http://localhost:3000/api/scan-email";
    this.scannedEmails = new Map();
    this.isScanning = false;
    this.observer = null;
    this.panelVisible = true;
    this.panelMinimized = false;

    this.init();
  }

  /**
   * Initialize the scanner
   */
  init() {
    console.log("🛡️ Email Security Scanner Activated");

    // Check if we're on a valid email domain
    if (!this.isValidEmailDomain()) {
      console.log("❌ Not on a supported email domain");
      return;
    }

    // Inject the floating panel UI
    this.injectFloatingPanel();

    // Wait for DOM to be fully loaded
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.startScanning());
    } else {
      // Small delay to let email client fully load
      setTimeout(() => this.startScanning(), 2000);
    }

    // Setup mutation observer for dynamic content
    this.setupMutationObserver();

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true;
    });

    // Check saved panel state
    this.loadPanelState();
  }

  /**
   * Check if current domain is a valid email provider
   */
  isValidEmailDomain() {
    const validDomains = [
      "email.com",
      "mail.google.com",
      "outlook.live.com",
      "outlook.office.com",
      "mail.yahoo.com",
    ];

    const currentHost = window.location.hostname;
    return validDomains.some((domain) => currentHost.includes(domain));
  }

  /**
   * Inject floating panel into the page
   */
  injectFloatingPanel() {
    // Remove existing panel if any
    const existingPanel = document.getElementById("email-scanner-panel");
    if (existingPanel) {
      existingPanel.remove();
    }

    // Create panel HTML
    const panelHTML = `
      <div id="email-scanner-panel" class="scanner-panel">
        <!-- Header -->
        <div class="scanner-panel-header">
          <div class="scanner-panel-logo">
            <span class="scanner-shield">🛡️</span>
            <span class="scanner-title">Email Scanner</span>
          </div>
          <div class="scanner-panel-controls">
            <button class="scanner-btn-minimize" id="scannerMinimize" title="Minimize">
              <span>−</span>
            </button>
            <button class="scanner-btn-close" id="scannerClose" title="Close">
              <span>×</span>
            </button>
          </div>
        </div>

        <!-- Content -->
        <div class="scanner-panel-content" id="scannerContent">
          <!-- Status -->
          <div class="scanner-status" id="scannerStatus">
            <div class="scanner-status-dot scanning"></div>
            <span class="scanner-status-text">Initializing...</span>
          </div>

          <!-- Stats Grid -->
          <div class="scanner-stats">
            <div class="scanner-stat safe">
              <span class="stat-number" id="panelSafeCount">0</span>
              <span class="stat-label">Safe</span>
            </div>
            <div class="scanner-stat suspected">
              <span class="stat-number" id="panelSuspectedCount">0</span>
              <span class="stat-label">Suspected</span>
            </div>
            <div class="scanner-stat dangerous">
              <span class="stat-number" id="panelDangerousCount">0</span>
              <span class="stat-label">Dangerous</span>
            </div>
          </div>

          <!-- Score Circle -->
          <div class="scanner-score-container">
            <div class="scanner-score-circle" id="scannerScoreCircle">
              <span class="scanner-score-value" id="panelScoreValue">--</span>
            </div>
            <span class="scanner-score-label">Safety Score</span>
          </div>

          <!-- Email List -->
          <div class="scanner-email-section">
            <div class="scanner-email-header">
              <span>Recent Scans</span>
              <span class="scanner-email-count" id="panelEmailCount">0</span>
            </div>
            <div class="scanner-email-list" id="panelEmailList">
              <div class="scanner-empty">
                <span>📭</span>
                <p>Scanning emails...</p>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="scanner-actions">
            <button class="scanner-btn-rescan" id="panelRescan">
              🔄 Rescan All
            </button>
          </div>
        </div>

        <!-- Minimized View -->
        <div class="scanner-panel-minimized" id="scannerMinimizedView">
          <span class="mini-shield">🛡️</span>
          <span class="mini-score" id="miniScore">--</span>
          <span class="mini-status" id="miniStatus">•</span>
        </div>
      </div>

      <!-- Floating Toggle Button (when panel is closed) -->
      <div id="email-scanner-toggle" class="scanner-toggle hidden">
        <span class="toggle-icon">🛡️</span>
        <span class="toggle-badge" id="toggleBadge">0</span>
      </div>
    `;

    // Insert panel into body
    const panelContainer = document.createElement("div");
    panelContainer.innerHTML = panelHTML;
    document.body.appendChild(panelContainer);

    // Bind panel events
    this.bindPanelEvents();
  }

  /**
   * Bind events for the floating panel
   */
  bindPanelEvents() {
    // Close button
    const closeBtn = document.getElementById("scannerClose");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.hidePanel());
    }

    // Minimize button
    const minimizeBtn = document.getElementById("scannerMinimize");
    if (minimizeBtn) {
      minimizeBtn.addEventListener("click", () => this.toggleMinimize());
    }

    // Toggle button (to show panel again)
    const toggleBtn = document.getElementById("email-scanner-toggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => this.showPanel());
    }

    // Rescan button
    const rescanBtn = document.getElementById("panelRescan");
    if (rescanBtn) {
      rescanBtn.addEventListener("click", () => this.rescanEmails());
    }

    // Make panel draggable
    this.makePanelDraggable();
  }

  /**
   * Make panel draggable
   */
  makePanelDraggable() {
    const panel = document.getElementById("email-scanner-panel");
    const header = panel?.querySelector(".scanner-panel-header");

    if (!panel || !header) return;

    let isDragging = false;
    let startX, startY, initialX, initialY;

    header.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return; // Don't drag when clicking buttons

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = panel.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;

      header.style.cursor = "grabbing";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;

      e.preventDefault();

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      let newX = initialX + deltaX;
      let newY = initialY + deltaY;

      // Keep panel within viewport
      const maxX = window.innerWidth - panel.offsetWidth;
      const maxY = window.innerHeight - panel.offsetHeight;

      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));

      panel.style.right = "auto";
      panel.style.left = newX + "px";
      panel.style.top = newY + "px";
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
      header.style.cursor = "grab";
      this.savePanelPosition();
    });
  }

  /**
   * Hide panel
   */
  hidePanel() {
    const panel = document.getElementById("email-scanner-panel");
    const toggle = document.getElementById("email-scanner-toggle");

    if (panel) panel.classList.add("hidden");
    if (toggle) toggle.classList.remove("hidden");

    this.panelVisible = false;
    this.savePanelState();
  }

  /**
   * Show panel
   */
  showPanel() {
    const panel = document.getElementById("email-scanner-panel");
    const toggle = document.getElementById("email-scanner-toggle");

    if (panel) panel.classList.remove("hidden");
    if (toggle) toggle.classList.add("hidden");

    this.panelVisible = true;
    this.panelMinimized = false;
    this.savePanelState();
  }

  /**
   * Toggle minimize state
   */
  toggleMinimize() {
    const panel = document.getElementById("email-scanner-panel");
    const content = document.getElementById("scannerContent");
    const minimizedView = document.getElementById("scannerMinimizedView");
    const minimizeBtn = document.getElementById("scannerMinimize");

    this.panelMinimized = !this.panelMinimized;

    if (this.panelMinimized) {
      panel?.classList.add("minimized");
      content?.classList.add("hidden");
      minimizedView?.classList.remove("hidden");
      if (minimizeBtn) minimizeBtn.innerHTML = "<span>+</span>";
    } else {
      panel?.classList.remove("minimized");
      content?.classList.remove("hidden");
      minimizedView?.classList.add("hidden");
      if (minimizeBtn) minimizeBtn.innerHTML = "<span>−</span>";
    }

    this.savePanelState();
  }

  /**
   * Save panel state to storage
   */
  savePanelState() {
    chrome.storage.local.set({
      panelState: {
        visible: this.panelVisible,
        minimized: this.panelMinimized,
      },
    });
  }

  /**
   * Save panel position
   */
  savePanelPosition() {
    const panel = document.getElementById("email-scanner-panel");
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    chrome.storage.local.set({
      panelPosition: {
        left: rect.left,
        top: rect.top,
      },
    });
  }

  /**
   * Load panel state from storage
   */
  loadPanelState() {
    chrome.storage.local.get(["panelState", "panelPosition"], (result) => {
      // Restore visibility state
      if (result.panelState) {
        if (!result.panelState.visible) {
          this.hidePanel();
        } else if (result.panelState.minimized) {
          this.toggleMinimize();
        }
      }

      // Restore position
      if (result.panelPosition) {
        const panel = document.getElementById("email-scanner-panel");
        if (panel) {
          panel.style.right = "auto";
          panel.style.left = result.panelPosition.left + "px";
          panel.style.top = result.panelPosition.top + "px";
        }
      }
    });
  }

  /**
   * Update panel UI with scan results
   */
  updatePanelUI() {
    const stats = this.getStatistics();
    const emails = Array.from(this.scannedEmails.values());

    // Update stats
    const safeCount = document.getElementById("panelSafeCount");
    const suspectedCount = document.getElementById("panelSuspectedCount");
    const dangerousCount = document.getElementById("panelDangerousCount");
    const scoreValue = document.getElementById("panelScoreValue");
    const emailCount = document.getElementById("panelEmailCount");
    const scoreCircle = document.getElementById("scannerScoreCircle");
    const miniScore = document.getElementById("miniScore");
    const miniStatus = document.getElementById("miniStatus");
    const toggleBadge = document.getElementById("toggleBadge");

    if (safeCount) safeCount.textContent = stats.safe;
    if (suspectedCount) suspectedCount.textContent = stats.suspected;
    if (dangerousCount) dangerousCount.textContent = stats.dangerous;
    if (scoreValue) scoreValue.textContent = stats.averageScore || "--";
    if (emailCount) emailCount.textContent = stats.total;
    if (miniScore) miniScore.textContent = stats.averageScore || "--";

    // Update score circle color
    if (scoreCircle) {
      scoreCircle.className = "scanner-score-circle";
      if (stats.averageScore >= 80) {
        scoreCircle.classList.add("safe");
      } else if (stats.averageScore >= 50) {
        scoreCircle.classList.add("suspected");
      } else if (stats.averageScore > 0) {
        scoreCircle.classList.add("dangerous");
      }
    }

    // Update mini status
    if (miniStatus) {
      if (stats.dangerous > 0) {
        miniStatus.className = "mini-status dangerous";
      } else if (stats.suspected > 0) {
        miniStatus.className = "mini-status suspected";
      } else {
        miniStatus.className = "mini-status safe";
      }
    }

    // Update toggle badge
    if (toggleBadge) {
      const alertCount = stats.dangerous + stats.suspected;
      toggleBadge.textContent = alertCount;
      toggleBadge.className =
        alertCount > 0 ? "toggle-badge alert" : "toggle-badge";
    }

    // Update email list
    this.updatePanelEmailList(emails);

    // Update status
    this.updatePanelStatus(stats);
  }

  /**
   * Update panel email list
   */
  updatePanelEmailList(emails) {
    const listContainer = document.getElementById("panelEmailList");
    if (!listContainer) return;

    if (emails.length === 0) {
      listContainer.innerHTML = `
        <div class="scanner-empty">
          <span>📭</span>
          <p>No emails scanned yet</p>
        </div>
      `;
      return;
    }

    // Sort by score (lowest first - threats on top)
    const sortedEmails = [...emails]
      .sort((a, b) => a.score - b.score)
      .slice(0, 10);

    const emailsHTML = sortedEmails
      .map((email) => {
        const scoreClass =
          email.score >= 80
            ? "safe"
            : email.score >= 50
              ? "suspected"
              : "dangerous";
        const senderDisplay = this.truncateText(email.sender, 25);
        const subjectDisplay = this.truncateText(email.subject, 30);

        return `
        <div class="scanner-email-item ${scoreClass}">
          <div class="email-score-badge ${scoreClass}">${email.score}</div>
          <div class="email-info">
            <div class="email-sender">${this.escapeHtml(senderDisplay)}</div>
            <div class="email-subject">${this.escapeHtml(subjectDisplay)}</div>
          </div>
        </div>
      `;
      })
      .join("");

    listContainer.innerHTML = emailsHTML;
  }

  /**
   * Update panel status indicator
   */
  updatePanelStatus(stats) {
    const statusContainer = document.getElementById("scannerStatus");
    if (!statusContainer) return;

    const dot = statusContainer.querySelector(".scanner-status-dot");
    const text = statusContainer.querySelector(".scanner-status-text");

    if (this.isScanning) {
      dot?.classList.add("scanning");
      dot?.classList.remove("safe", "warning", "danger");
      if (text) text.textContent = "Scanning emails...";
    } else if (stats.dangerous > 0) {
      dot?.classList.remove("scanning", "safe");
      dot?.classList.add("danger");
      if (text) text.textContent = `⚠️ ${stats.dangerous} threat(s) detected!`;
    } else if (stats.suspected > 0) {
      dot?.classList.remove("scanning", "safe", "danger");
      dot?.classList.add("warning");
      if (text) text.textContent = `${stats.suspected} suspected email(s)`;
    } else if (stats.total > 0) {
      dot?.classList.remove("scanning", "warning", "danger");
      dot?.classList.add("safe");
      if (text) text.textContent = `✓ All ${stats.total} emails are safe`;
    } else {
      dot?.classList.remove("safe", "warning", "danger");
      dot?.classList.add("scanning");
      if (text) text.textContent = "Waiting for emails...";
    }
  }

  /**
   * Helper: Truncate text
   */
  truncateText(text, maxLength) {
    if (!text) return "";
    return text.length > maxLength
      ? text.substring(0, maxLength) + "..."
      : text;
  }

  /**
   * Helper: Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Rescan all emails
   */
  async rescanEmails() {
    const rescanBtn = document.getElementById("panelRescan");
    if (rescanBtn) {
      rescanBtn.disabled = true;
      rescanBtn.textContent = "⏳ Scanning...";
    }

    this.scannedEmails.clear();
    await this.startScanning();

    if (rescanBtn) {
      rescanBtn.disabled = false;
      rescanBtn.textContent = "🔄 Rescan All";
    }
  }

  /**
   * Start the email scanning process
   */
  async startScanning() {
    if (this.isScanning) return;
    this.isScanning = true;

    this.updatePanelUI();
    console.log("🔍 Starting email scan...");

    // Extract emails from DOM
    const emails = this.extractEmailsFromDOM();

    if (emails.length === 0) {
      console.log("📭 No emails found");
      this.isScanning = false;
      this.updatePanelUI();
      return;
    }

    console.log(`📧 Found ${emails.length} emails`);

    // Scan each email
    for (const email of emails) {
      await this.scanEmail(email);
      this.updatePanelUI(); // Update UI after each scan
    }

    this.isScanning = false;
    this.updatePanelUI();
    this.updatePopupData();

    // 🔍 DEBUG: Log all scanned emails
    console.log(
      "🧪 ALL SCANNED EMAILS:",
      Array.from(this.scannedEmails.values()),
    );
  }

  /**
   * Extract email data from DOM
   */
  extractEmailsFromDOM() {
    const emails = [];
    const emailSelectors = this.getEmailSelectors();

    emailSelectors.forEach((selector) => {
      const emailElements = document.querySelectorAll(selector.container);

      emailElements.forEach((element, index) => {
        try {
          const emailData = this.parseEmailElement(element, selector, index);
          // console.log("Parsed emailData:", emailData);
          if (emailData && !this.scannedEmails.has(emailData.id)) {
            emails.push(emailData);
          }
        } catch (error) {
          console.error("Error parsing email element:", error);
        }
      });
    });
    console.log(emails);
    return emails;
  }

  detectOpenedEmail() {
    const bodyEl = document.querySelector("div.a3s");
    const subjectEl =
      document.querySelector("h2.hP") || document.querySelector("h2");

    const senderEl = document.querySelector("span.gD");

    if (!subjectEl || !senderEl || !bodyEl) return;

    const subject = subjectEl.innerText.trim();
    const sender = senderEl.getAttribute("email") || senderEl.innerText.trim();
    const body = bodyEl.innerText.trim();

    const timestamp = new Date().toISOString();
    const id = this.generateEmailId(sender, subject, timestamp);

    if (this.scannedEmails.has(id)) return;

    const emailData = {
      id,
      sender,
      subject,
      body,
      timestamp,
      fullContent: `${subject} ${body}`,
      element: subjectEl,
      scanSource: "EMAIL_OPEN",
    };

    console.log("📖 Opened email detected → sending to backend");
    this.scanEmail(emailData);
  }

  /**
   * Get selectors based on email provider
   */
  getEmailSelectors() {
    const host = window.location.hostname;

    // Gmail selectors
    if (host.includes("mail.google.com")) {
      return [
        {
          container: "tr.zA",
          sender: ".yW span[email], .yW .bA4 span",
          senderAttr: "email",
          subject: ".y6 span:first-child, .bog",
          snippet: ".y2, .Zt",
          timestamp: ".xW span, .Bq span",
          row: "tr.zA",
        },
      ];
    }

    // Outlook selectors
    if (host.includes("outlook")) {
      return [
        {
          container: '[data-convid], .customScrollBar div[role="option"]',
          sender: '[data-testid="MessageListItem-FromName"], ._3-Fx_',
          subject: '[data-testid="MessageListItem-Subject"], ._1U4vB',
          snippet: '[data-testid="MessageListItem-Preview"], ._2l9wS',
          timestamp: '[data-testid="MessageListItem-Timestamp"], ._3qI6O',
          row: "[data-convid]",
        },
      ];
    }

    // Generic selectors
    return [
      {
        container: ".email-row, .message-item, [data-email-id], .mail-item",
        sender: ".sender, .from, [data-sender], .mail-from",
        subject: ".subject, [data-subject], .mail-subject",
        snippet: ".snippet, .preview, .body-preview, .mail-snippet",
        timestamp: ".timestamp, .date, [data-timestamp], .mail-date",
        row: ".email-row, .message-item",
      },
    ];
  }

  /**
   * Parse individual email element
   */
  parseEmailElement(element, selector, index) {
    const senderElement = element.querySelector(selector.sender);
    const subjectElement = element.querySelector(selector.subject);
    const snippetElement = element.querySelector(selector.snippet);
    const timestampElement = element.querySelector(selector.timestamp);

    let senderEmail = "";
    if (senderElement) {
      senderEmail = selector.senderAttr
        ? senderElement.getAttribute(selector.senderAttr)
        : senderElement.textContent.trim();
    }

    if (!senderEmail || !senderEmail.includes("@")) {
      const emailMatch = element.innerHTML.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch) {
        senderEmail = emailMatch[0];
      } else if (senderElement) {
        senderEmail = senderElement.textContent.trim() || "unknown@sender.com";
      }
    }

    const subject = subjectElement?.textContent.trim() || "No Subject";
    const snippet = snippetElement?.textContent.trim() || "";
    const timestamp =
      timestampElement?.textContent.trim() || new Date().toISOString();

    const id = this.generateEmailId(senderEmail, subject, timestamp);

    return {
      id,
      element,
      sender: senderEmail,
      subject,
      body: snippet,
      timestamp,
      fullContent: `${subject} ${snippet}`,
    };
  }

  /**
   * Generate unique email ID
   */
  generateEmailId(sender, subject, timestamp) {
    const str = `${sender}-${subject}-${timestamp}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `email_${Math.abs(hash)}`;
  }

  /**
   * Scan individual email through backend API
   */
  async scanEmail(emailData) {
    try {
      const payload = {
        id: emailData.id,
        sender: emailData.sender,
        subject: emailData.subject,
        body: emailData.body,
        timestamp: emailData.timestamp,
        fullContent: emailData.fullContent,
        scanSource: emailData.scanSource || "INBOX_LIST",
      };

      console.log("Payload:", payload);
      console.log(`🔄 Scanning: ${emailData.sender}`);
      console.log("🚀 SENDING TO BACKEND:", JSON.stringify(payload, null, 2));
      const response = await fetch(this.API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      const scanResult = {
        ...emailData,
        score: result.score,
        status: result.status,
        threats: result.threats || [],
        scannedAt: new Date().toISOString(),
      };

      this.scannedEmails.set(emailData.id, scanResult);
      console.log("📦 SCANNED EMAIL OBJECT:", scanResult);
      this.applyVisualIndicator(emailData.element, scanResult);

      console.log(`✅ Scanned: ${emailData.sender} - Score: ${result.score}`);

      return scanResult;
    } catch (error) {
      console.error(`❌ Error scanning email:`, error);

      // Fallback: Generate local score if API fails
      const fallbackScore = this.generateFallbackScore(emailData);
      const scanResult = {
        ...emailData,
        score: fallbackScore.score,
        status: fallbackScore.status,
        threats: fallbackScore.threats,
        scannedAt: new Date().toISOString(),
        isOffline: true,
      };

      this.scannedEmails.set(emailData.id, scanResult);
      this.applyVisualIndicator(emailData.element, scanResult);

      return scanResult;
    }
  }

  /**
   * Generate fallback score when API is unavailable
   */
  generateFallbackScore(emailData) {
    let score = 85; // Default score
    const threats = [];
    const content = `${emailData.subject} ${emailData.body}`.toLowerCase();

    // Basic pattern checks
    const suspiciousPatterns = [
      {
        pattern: /urgent|immediate|action required/i,
        penalty: 15,
        threat: "urgency",
      },
      {
        pattern: /verify.*account|confirm.*identity/i,
        penalty: 20,
        threat: "phishing",
      },
      {
        pattern: /click here|click below/i,
        penalty: 10,
        threat: "suspicious_link",
      },
      { pattern: /winner|lottery|million/i, penalty: 25, threat: "scam" },
      {
        pattern: /password|credential|login/i,
        penalty: 10,
        threat: "credential_request",
      },
    ];

    suspiciousPatterns.forEach(({ pattern, penalty, threat }) => {
      if (pattern.test(content)) {
        score -= penalty;
        threats.push(threat);
      }
    });

    score = Math.max(0, Math.min(100, score));

    return {
      score,
      status: score >= 80 ? "safe" : score >= 50 ? "suspected" : "dangerous",
      threats,
    };
  }

  /**
   * Apply visual indicator based on scan result
   */
  applyVisualIndicator(element, result) {
    if (!element) return;

    element.classList.remove(
      "email-safe",
      "email-suspected",
      "email-dangerous",
      "email-error",
    );

    let badge = element.querySelector(".security-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "security-badge";
      element.style.position = "relative";
      element.insertBefore(badge, element.firstChild);
    }

    const score = result.score;
    let statusClass, statusText, statusColor;

    if (score >= 80) {
      statusClass = "email-safe";
      statusText = "✓";
      statusColor = "#22c55e";
    } else if (score >= 50) {
      statusClass = "email-suspected";
      statusText = "⚠";
      statusColor = "#f97316";
    } else {
      statusClass = "email-dangerous";
      statusText = "✗";
      statusColor = "#ef4444";
    }

    element.classList.add(statusClass);

    badge.innerHTML = `
      <span class="badge-icon">${statusText}</span>
      <span class="badge-score">${score}</span>
    `;
    badge.style.cssText = `
      position: absolute;
      left: 5px;
      top: 50%;
      transform: translateY(-50%);
      background: ${statusColor};
      color: white;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: bold;
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 3px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    `;

    element.style.borderLeft = `3px solid ${statusColor}`;
  }

  /**
   * Setup mutation observer for dynamic content
   */
  setupMutationObserver() {
    const targetNode = document.body;

    const config = {
      childList: true,
      subtree: true,
      attributes: false,
    };

    let debounceTimer;

    this.observer = new MutationObserver((mutations) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const hasNewEmails = mutations.some((mutation) => {
          return mutation.addedNodes.length > 0;
        });

        if (hasNewEmails && !this.isScanning) {
          this.startScanning();
        }

        this.detectOpenedEmail();
      }, 1500);
    });

    this.observer.observe(targetNode, config);
  }

  /**
   * Handle messages from popup/background
   */
  handleMessage(request, sender, sendResponse) {
    switch (request.action) {
      case "getScannedEmails":
        sendResponse({
          success: true,
          emails: Array.from(this.scannedEmails.values()),
        });
        break;

      case "rescanEmails":
        this.scannedEmails.clear();
        this.startScanning().then(() => {
          sendResponse({
            success: true,
            message: "Rescan completed",
          });
        });
        break;

      case "getStats":
        sendResponse({
          success: true,
          stats: this.getStatistics(),
        });
        break;

      case "togglePanel":
        if (this.panelVisible) {
          this.hidePanel();
        } else {
          this.showPanel();
        }
        sendResponse({ success: true, visible: this.panelVisible });
        break;

      default:
        sendResponse({ success: false, error: "Unknown action" });
    }
  }

  /**
   * Get scanning statistics
   */
  getStatistics() {
    const emails = Array.from(this.scannedEmails.values());

    return {
      total: emails.length,
      safe: emails.filter((e) => e.score >= 80).length,
      suspected: emails.filter((e) => e.score >= 50 && e.score < 80).length,
      dangerous: emails.filter((e) => e.score < 50).length,
      averageScore:
        emails.length > 0
          ? Math.round(
              emails.reduce((sum, e) => sum + e.score, 0) / emails.length,
            )
          : 0,
    };
  }

  /**
   * Update popup with latest data
   */
  updatePopupData() {
    chrome.runtime
      .sendMessage({
        action: "updateStats",
        stats: this.getStatistics(),
        emails: Array.from(this.scannedEmails.values()),
      })
      .catch(() => {
        // Popup might not be open
      });
  }
}

// Initialize scanner
const emailScanner = new EmailSecurityScanner();

// log updates remaining
