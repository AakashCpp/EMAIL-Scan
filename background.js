/**
 * Email Security Scanner - Background Service Worker
 */

class BackgroundService {
  constructor() {
    this.stats = {
      total: 0,
      safe: 0,
      suspected: 0,
      dangerous: 0,
    };

    this.init();
  }

  init() {
    // Listen for installation
    chrome.runtime.onInstalled.addListener((details) => {
      console.log("🛡️ Email Security Scanner installed");

      if (details.reason === "install") {
        this.showWelcomeNotification();
      }
    });

    // Listen for messages
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true;
    });

    // Listen for tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === "complete" && this.isEmailDomain(tab.url)) {
        this.updateBadge(tabId);
      }
    });
  }

  /**
   * Check if URL is an email domain
   */
  isEmailDomain(url) {
    if (!url) return false;
    const emailDomains = ["email.com", "mail.google.com", "outlook.live.com"];
    return emailDomains.some((domain) => url.includes(domain));
  }

  /**
   * Handle messages from content script and popup
   */
  handleMessage(request, sender, sendResponse) {
    switch (request.action) {
      case "updateStats":
        this.stats = request.stats;
        this.updateBadge(sender.tab?.id);
        chrome.storage.local.set({
          stats: request.stats,
          emails: request.emails,
        });
        sendResponse({ success: true });
        break;

      case "getStoredData":
        chrome.storage.local.get(["stats", "emails"], (result) => {
          sendResponse({
            success: true,
            stats: result.stats || this.stats,
            emails: result.emails || [],
          });
        });
        break;

      case "scanCurrentTab":
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(
              tabs[0].id,
              { action: "rescanEmails" },
              (response) => {
                sendResponse(response);
              }
            );
          }
        });
        break;

      default:
        sendResponse({ success: false, error: "Unknown action" });
    }
  }

  /**
   * Update extension badge
   */
  updateBadge(tabId) {
    if (!tabId) return;

    const dangerCount = this.stats.dangerous || 0;

    if (dangerCount > 0) {
      chrome.action.setBadgeText({
        text: dangerCount.toString(),
        tabId,
      });
      chrome.action.setBadgeBackgroundColor({
        color: "#EF4444",
        tabId,
      });
    } else if (this.stats.suspected > 0) {
      chrome.action.setBadgeText({
        text: this.stats.suspected.toString(),
        tabId,
      });
      chrome.action.setBadgeBackgroundColor({
        color: "#F97316",
        tabId,
      });
    } else {
      chrome.action.setBadgeText({
        text: "✓",
        tabId,
      });
      chrome.action.setBadgeBackgroundColor({
        color: "#22C55E",
        tabId,
      });
    }
  }

  /**
   * Show welcome notification - FIXED VERSION
   */
  showWelcomeNotification() {
    // Check if notifications API is available
    if (chrome.notifications && chrome.notifications.create) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Email Security Scanner Active",
        message: "Your emails will now be scanned for potential threats.",
      });
    } else {
      // Fallback: Just log to console
      console.log("🛡️ Email Security Scanner is now active!");
      console.log("📧 Your emails will be scanned for potential threats.");
    }
  }
}

// Initialize background service
const backgroundService = new BackgroundService();
