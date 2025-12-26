/**
 * Email Security Scanner - Popup Script
 */

class PopupController {
  constructor() {
    this.elements = {};
    this.stats = { total: 0, safe: 0, suspected: 0, dangerous: 0 };
    this.emails = [];

    this.init();
  }

  init() {
    this.cacheElements();
    this.bindEvents();
    this.loadData();
    this.checkActiveTab();
  }

  /**
   * Cache DOM elements
   */
  cacheElements() {
    this.elements = {
      statusIndicator: document.getElementById("statusIndicator"),
      safeCount: document.getElementById("safeCount"),
      suspectedCount: document.getElementById("suspectedCount"),
      dangerousCount: document.getElementById("dangerousCount"),
      averageScore: document.getElementById("averageScore"),
      scoreProgress: document.getElementById("scoreProgress"),
      emailList: document.getElementById("emailList"),
      emailCount: document.getElementById("emailCount"),
      emptyState: document.getElementById("emptyState"),
      rescanBtn: document.getElementById("rescanBtn"),
      settingsBtn: document.getElementById("settingsBtn"),
    };
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    this.elements.rescanBtn.addEventListener("click", () =>
      this.rescanEmails()
    );
    this.elements.settingsBtn.addEventListener("click", () =>
      this.openSettings()
    );

    // Listen for updates from content script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "updateStats") {
        this.updateUI(request.stats, request.emails);
      }
    });
  }

  /**
   * Check if current tab is an email domain
   */
  async checkActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      const emailDomains = ["email.com", "mail.google.com", "outlook.live.com"];
      const isEmailDomain = emailDomains.some((domain) =>
        tab.url?.includes(domain)
      );

      if (isEmailDomain) {
        this.setStatus("active", "Scanner Active");
        this.requestDataFromContentScript();
      } else {
        this.setStatus("inactive", "Not on email site");
      }
    } catch (error) {
      console.error("Error checking tab:", error);
      this.setStatus("inactive", "Unable to detect");
    }
  }

  /**
   * Request data from content script
   */
  async requestDataFromContentScript() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      chrome.tabs.sendMessage(
        tab.id,
        { action: "getScannedEmails" },
        (response) => {
          if (chrome.runtime.lastError) {
            console.log("Content script not ready, loading from storage");
            this.loadData();
            return;
          }

          if (response?.success) {
            this.updateEmailList(response.emails);
            this.calculateStats(response.emails);
          }
        }
      );
    } catch (error) {
      console.error("Error requesting data:", error);
    }
  }

  /**
   * Load data from storage
   */
  loadData() {
    chrome.runtime.sendMessage({ action: "getStoredData" }, (response) => {
      if (response?.success) {
        this.stats = response.stats;
        this.emails = response.emails;
        this.updateUI(response.stats, response.emails);
      }
    });
  }

  /**
   * Update UI with stats and emails
   */
  updateUI(stats, emails) {
    // Update stats
    this.elements.safeCount.textContent = stats.safe || 0;
    this.elements.suspectedCount.textContent = stats.suspected || 0;
    this.elements.dangerousCount.textContent = stats.dangerous || 0;

    // Update average score
    const avgScore = stats.averageScore || 0;
    this.elements.averageScore.textContent = avgScore;
    this.updateScoreRing(avgScore);

    // Update email list
    this.updateEmailList(emails || []);

    // Update status based on threats
    if (stats.dangerous > 0) {
      this.setStatus("warning", `${stats.dangerous} threats detected`);
    } else if (stats.total > 0) {
      this.setStatus("active", "All emails scanned");
    }
  }

  /**
   * Update the score ring progress
   */
  updateScoreRing(score) {
    const circumference = 283; // 2 * π * 45
    const offset = circumference - (score / 100) * circumference;

    this.elements.scoreProgress.style.strokeDashoffset = offset;

    // Update color based on score
    let color;
    if (score >= 80) {
      color = "#22c55e";
    } else if (score >= 50) {
      color = "#f97316";
    } else {
      color = "#ef4444";
    }

    this.elements.scoreProgress.style.stroke = color;
  }

  /**
   * Update email list
   */
  updateEmailList(emails) {
    this.elements.emailCount.textContent = emails.length;

    if (emails.length === 0) {
      this.elements.emptyState.style.display = "block";
      return;
    }

    this.elements.emptyState.style.display = "none";

    // Sort by score (lowest first - show threats first)
    const sortedEmails = [...emails].sort((a, b) => a.score - b.score);

    // Render email list
    const emailHTML = sortedEmails
      .map((email) => {
        const scoreClass =
          email.score >= 80
            ? "safe"
            : email.score >= 50
            ? "suspected"
            : "dangerous";

        return `
        <div class="email-item">
          <div class="email-score ${scoreClass}">${email.score}</div>
          <div class="email-details">
            <div class="email-sender">${this.escapeHtml(email.sender)}</div>
            <div class="email-subject">${this.escapeHtml(email.subject)}</div>
          </div>
        </div>
      `;
      })
      .join("");

    this.elements.emailList.innerHTML = emailHTML;
  }

  /**
   * Calculate stats from emails
   */
  calculateStats(emails) {
    const stats = {
      total: emails.length,
      safe: emails.filter((e) => e.score >= 80).length,
      suspected: emails.filter((e) => e.score >= 50 && e.score < 80).length,
      dangerous: emails.filter((e) => e.score < 50).length,
      averageScore:
        emails.length > 0
          ? Math.round(
              emails.reduce((sum, e) => sum + e.score, 0) / emails.length
            )
          : 0,
    };

    this.updateUI(stats, emails);
  }

  /**
   * Set status indicator
   */
  setStatus(type, text) {
    const indicator = this.elements.statusIndicator;
    indicator.className = `status-indicator ${type}`;
    indicator.querySelector(".status-text").textContent = text;
  }

  /**
   * Rescan emails
   */
  async rescanEmails() {
    this.elements.rescanBtn.classList.add("loading");
    this.setStatus("active", "Rescanning...");

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      chrome.tabs.sendMessage(
        tab.id,
        { action: "rescanEmails" },
        (response) => {
          this.elements.rescanBtn.classList.remove("loading");

          if (response?.success) {
            this.setStatus("active", "Rescan complete");
            this.requestDataFromContentScript();
          } else {
            this.setStatus("warning", "Rescan failed");
          }
        }
      );
    } catch (error) {
      console.error("Error rescanning:", error);
      this.elements.rescanBtn.classList.remove("loading");
      this.setStatus("warning", "Rescan failed");
    }
  }

  /**
   * Open settings
   */
  openSettings() {
    chrome.runtime.openOptionsPage();
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize popup
document.addEventListener("DOMContentLoaded", () => {
  new PopupController();
});
