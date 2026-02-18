/**
 * widget/like-button.js
 *
 * Wix Self-Hosted Site Widget — Custom Element
 *
 * This file is hosted on your Vercel server at:
 *   https://your-app.vercel.app/widget/like-button.js
 *
 * In Wix Dev Center you register it as a Site Widget extension:
 *   Tag name:   repeater-like-button
 *   Script URL: https://your-app.vercel.app/widget/like-button.js
 *
 * How it works:
 *   - Wix injects this script into the live site via the custom element
 *   - Each instance gets a unique `compId` attribute from Wix automatically
 *   - On load: fetches like count + visitor's liked state from your API
 *   - On click: calls /api/toggle, updates UI optimistically
 *
 * Auth:
 *   - Uses @wix/sdk with AppStrategy to get a visitor-level Wix access token
 *   - Sends that token to your backend which elevates it to app-level
 */

(function () {
  // ── SDK loaded from Wix CDN ────────────────────────────────────────────────
  // The Wix SDK is available globally in the custom element context
  // via window.__wix__ injected by Wix
  const API_BASE = 'https://YOUR_VERCEL_APP.vercel.app'; // ← replace after deploy

  // ── Visitor ID — stable per browser ────────────────────────────────────────
  function getVisitorId() {
    const key = '__rl_vid__';
    try {
      let id = localStorage.getItem(key);
      if (!id) {
        id = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(key, id);
      }
      return id;
    } catch (_) {
      // localStorage blocked (private mode etc.) — use in-memory fallback
      if (!window.__rl_vid__) {
        window.__rl_vid__ = 'v_' + Math.random().toString(36).slice(2);
      }
      return window.__rl_vid__;
    }
  }

  // ── Get Wix access token from the SDK context ──────────────────────────────
  // Wix injects wixSdk into the custom element environment
  async function getWixToken() {
    try {
      // window.__wixSDK__ is injected by Wix runtime in custom element context
      const sdk = window.__wixSDK__;
      if (sdk && sdk.auth && sdk.auth.getAuthHeaders) {
        const headers = await sdk.auth.getAuthHeaders();
        return headers.Authorization?.replace('Bearer ', '') ?? null;
      }
    } catch (_) {}
    return null;
  }

  // ── The Custom Element class ───────────────────────────────────────────────
  class RepeaterLikeButton extends HTMLElement {
    constructor() {
      super();
      this._liked = false;
      this._count = 0;
      this._loading = true;
      this._compId = null;
      this._visitorId = getVisitorId();

      // Shadow DOM keeps styles scoped — no leaking into the Wix page
      this.attachShadow({ mode: 'open' });
    }

    // Wix passes compId as an HTML attribute automatically
    static get observedAttributes() {
      return ['comp-id', 'style-variant', 'like-color', 'show-count'];
    }

    attributeChangedCallback(name, oldVal, newVal) {
      if (name === 'comp-id' && newVal && newVal !== oldVal) {
        this._compId = newVal;
        this._init();
      }
      if (['style-variant', 'like-color', 'show-count'].includes(name)) {
        this._render();
      }
    }

    connectedCallback() {
      this._render();
      // If compId was already set before connection
      if (this._compId) this._init();
    }

    // ── Load initial state from API ──────────────────────────────────────────
    async _init() {
      if (!this._compId) return;
      this._loading = true;
      this._render();

      try {
        const token = await getWixToken();
        const res = await fetch(`${API_BASE}/api/status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            compIds: [this._compId],
            visitorId: this._visitorId,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const status = data[this._compId] ?? { count: 0, liked: false };
          this._count = status.count;
          this._liked = status.liked;
        }
      } catch (err) {
        console.error('[RepeaterLikes] Init failed:', err);
      } finally {
        this._loading = false;
        this._render();
      }
    }

    // ── Handle like/unlike click ─────────────────────────────────────────────
    async _handleClick() {
      if (this._loading || !this._compId) return;

      // Optimistic update
      this._liked = !this._liked;
      this._count = Math.max(0, this._count + (this._liked ? 1 : -1));
      this._render();

      try {
        const token = await getWixToken();
        const res = await fetch(`${API_BASE}/api/toggle`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            compId: this._compId,
            visitorId: this._visitorId,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          this._liked = data.liked;
          this._count = data.count;
          this._render();
        }
      } catch (err) {
        console.error('[RepeaterLikes] Toggle failed:', err);
        // Revert on error
        this._liked = !this._liked;
        this._count = Math.max(0, this._count + (this._liked ? 1 : -1));
        this._render();
      }
    }

    // ── Render ───────────────────────────────────────────────────────────────
    _render() {
      const variant = this.getAttribute('style-variant') || 'pill';
      const color = this.getAttribute('like-color') || '#E53E3E';
      const showCount = this.getAttribute('show-count') !== 'false';
      const colorLight = color + '22';

      const heart = this._liked ? '♥' : '♡';
      const label = this._liked ? 'Liked' : 'Like';
      const countText = this._formatCount(this._count);

      this.shadowRoot.innerHTML = `
        <style>
          :host { display: inline-flex; align-items: center; }

          button {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            border: none;
            cursor: ${this._loading ? 'default' : 'pointer'};
            font-family: inherit;
            transition: all 0.2s ease;
            -webkit-tap-highlight-color: transparent;
            user-select: none;
          }

          button:active { transform: scale(0.93); }
          button:focus-visible { outline: 2px solid ${color}; outline-offset: 3px; border-radius: 999px; }

          /* Pill style */
          .pill {
            background: ${this._liked ? colorLight : '#f5f5f5'};
            border: 1.5px solid ${this._liked ? color : '#e0e0e0'};
            border-radius: 999px;
            padding: 7px 14px 7px 10px;
            font-size: 14px;
            font-weight: 500;
            color: ${this._liked ? color : '#666'};
          }
          .pill:hover { background: ${colorLight}; border-color: ${color}; color: ${color}; }

          /* Icon style */
          .icon {
            background: none;
            border: none;
            padding: 4px;
            font-size: 22px;
            color: ${this._liked ? color : '#ccc'};
          }
          .icon:hover { color: ${color}; }

          /* Minimal style */
          .minimal {
            background: none;
            border: none;
            padding: 2px 0;
            font-size: 13px;
            font-weight: ${this._liked ? '600' : '400'};
            color: ${this._liked ? color : '#888'};
          }
          .minimal:hover { color: ${color}; }

          .heart {
            display: inline-block;
            transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
            animation: ${this._liked && !this._loading ? 'pop 0.4s cubic-bezier(0.34,1.56,0.64,1)' : 'none'};
          }

          @keyframes pop {
            0%  { transform: scale(1); }
            40% { transform: scale(1.45); }
            70% { transform: scale(0.88); }
            100%{ transform: scale(1); }
          }

          .skeleton {
            background: linear-gradient(90deg, #f0f0f0 25%, #e4e4e4 50%, #f0f0f0 75%);
            background-size: 200% 100%;
            animation: shimmer 1.4s infinite linear;
            color: transparent !important;
            border-color: transparent !important;
            pointer-events: none;
            border-radius: 999px;
          }

          @keyframes shimmer {
            0%   { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        </style>

        <button
          class="${variant}${this._loading ? ' skeleton' : ''}"
          aria-label="${this._liked ? 'Unlike' : 'Like'}"
          aria-pressed="${this._liked}"
          ${this._loading ? 'disabled' : ''}
        >
          <span class="heart" aria-hidden="true">${heart}</span>
          ${variant !== 'icon' ? `<span class="label">${label}</span>` : ''}
          ${showCount ? `<span class="count">${this._loading ? '—' : countText}</span>` : ''}
        </button>
      `;

      // Attach click handler after render
      this.shadowRoot.querySelector('button')?.addEventListener('click', () => this._handleClick());
    }

    _formatCount(n) {
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
      if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
      return String(n);
    }
  }

  // ── Register the custom element ────────────────────────────────────────────
  // This name must match exactly what you enter in Wix Dev Center → Tag Name
  if (!customElements.get('repeater-like-button')) {
    customElements.define('repeater-like-button', RepeaterLikeButton);
  }
})();
