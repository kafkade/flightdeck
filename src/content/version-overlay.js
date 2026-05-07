// FlightDeck — content script
// Scans for build/version info in meta tags and HTML comments, shows an overlay banner.

(function () {
  const OVERLAY_ID = "flightdeck-version-overlay";

  // Check if the feature is enabled
  chrome.storage.local.get({ flightdeck_showVersion: false }, (result) => {
    if (result.flightdeck_showVersion) {
      showVersionOverlay();
    }
  });

  // Listen for toggle changes from the popup
  chrome.storage.onChanged.addListener((changes) => {
    if ("flightdeck_showVersion" in changes) {
      if (changes.flightdeck_showVersion.newValue) {
        showVersionOverlay();
      } else {
        removeOverlay();
      }
    }
  });

  function showVersionOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;

    const info = extractBuildInfo();
    if (!info) return;

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = [
      "position: fixed",
      "top: 0",
      "left: 0",
      "right: 0",
      "z-index: 2147483647",
      "background: rgba(30, 58, 95, 0.92)",
      "color: #fff",
      "font-family: 'Cascadia Code', 'Consolas', 'JetBrains Mono', monospace",
      "font-size: 12px",
      "padding: 6px 16px",
      "display: flex",
      "align-items: center",
      "gap: 16px",
      "box-shadow: 0 2px 8px rgba(0,0,0,0.3)",
      "user-select: text",
      "pointer-events: auto"
    ].join(";");

    // Label badge
    if (info.label) {
      const badge = document.createElement("span");
      badge.style.cssText = "background:#4A90D9;padding:2px 8px;border-radius:3px;font-weight:600;font-size:11px;letter-spacing:0.5px";
      badge.textContent = info.label;
      overlay.appendChild(badge);
    }

    // Detail text (server, extra info)
    if (info.detail) {
      const detail = document.createElement("span");
      detail.style.cssText = "color:rgba(255,255,255,0.7)";
      detail.textContent = info.detail;
      overlay.appendChild(detail);
    }

    // Version
    if (info.version) {
      const version = document.createElement("span");
      version.style.cssText = "color:#6BB5FF;font-weight:600";
      version.textContent = info.version;
      overlay.appendChild(version);
    }

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.title = "Hide build info overlay";
    closeBtn.style.cssText = [
      "margin-left: auto",
      "background: none",
      "border: none",
      "color: rgba(255,255,255,0.5)",
      "cursor: pointer",
      "font-size: 14px",
      "padding: 0 4px",
      "line-height: 1"
    ].join(";");
    closeBtn.addEventListener("click", () => {
      removeOverlay();
      chrome.storage.local.set({ flightdeck_showVersion: false });
    });

    overlay.appendChild(closeBtn);
    document.documentElement.appendChild(overlay);
  }

  function removeOverlay() {
    const el = document.getElementById(OVERLAY_ID);
    if (el) el.remove();
  }

  function extractBuildInfo() {
    // 1. Try <meta> tags first
    const metaInfo = extractFromMeta();
    if (metaInfo) return metaInfo;

    // 2. Try HTML comments via DOM tree walker
    const comments = getHtmlComments();
    for (const text of comments) {
      const info = parseComment(text);
      if (info) return info;
    }

    // 3. Fallback: regex the raw HTML source for comments the DOM may have stripped
    try {
      const rawHtml = new XMLSerializer().serializeToString(document);
      const commentPattern = /<!--([\s\S]*?)-->/g;
      let match;
      while ((match = commentPattern.exec(rawHtml)) !== null) {
        const info = parseComment(match[1]);
        if (info) return info;
      }
    } catch {
      // XMLSerializer may fail on some pages
    }

    return null;
  }

  function extractFromMeta() {
    // Look for common build-info meta tags
    const metaNames = [
      "build-version",
      "build-info",
      "app-version",
      "version",
      "x-build-version",
      "x-app-version"
    ];

    for (const name of metaNames) {
      const meta = document.querySelector(`meta[name="${name}"]`);
      if (meta && meta.content) {
        return {
          label: "Build",
          detail: null,
          version: meta.content
        };
      }
    }

    // Also check generator meta tag
    const generator = document.querySelector('meta[name="generator"]');
    if (generator && generator.content) {
      return {
        label: "Generator",
        detail: null,
        version: generator.content
      };
    }

    return null;
  }

  function parseComment(text) {
    // Pattern: <!-- Build: 1.2.3 -->
    const buildMatch = text.match(/Build[:\s]+v?([\d][\d.]+\S*)/i);
    if (buildMatch) {
      return { label: "Build", detail: null, version: buildMatch[1] };
    }

    // Pattern: <!-- Version: 1.2.3 -->
    const versionMatch = text.match(/Version[:\s]+v?([\d][\d.]+\S*)/i);
    if (versionMatch) {
      return { label: "Version", detail: null, version: versionMatch[1] };
    }

    // Pattern: <!-- ServerName: hostname; Build Version: 1.2.3 -->
    const serverBuildMatch = text.match(/Server(?:Name)?[:\s]+([^;,]+)[;,]\s*(?:Build\s*)?Version[:\s]+v?([\d][\d.]+\S*)/i);
    if (serverBuildMatch) {
      return {
        label: "Server",
        detail: serverBuildMatch[1].trim(),
        version: serverBuildMatch[2]
      };
    }

    // Pattern: <!-- ServerInfo: hostname 1.2.3 -->
    const serverInfoMatch = text.match(/ServerInfo[:\s]+(\S+)\s+([\d][\d.]+\S*)/i);
    if (serverInfoMatch) {
      return {
        label: "Server",
        detail: serverInfoMatch[1],
        version: serverInfoMatch[2]
      };
    }

    return null;
  }

  function getHtmlComments() {
    const comments = [];
    const walker = document.createTreeWalker(
      document,
      NodeFilter.SHOW_COMMENT,
      null
    );
    let node;
    while ((node = walker.nextNode())) {
      comments.push(node.nodeValue);
    }
    return comments;
  }
})();
