/* ai-chat.js - Connect frontend chat UI to backend AI
   - Keeps existing UI and function names (toggleAIChat, sendAIMessage)
   - Set API_BASE to your backend API root (no trailing slash)
*/

(() => {
  // ---------- CONFIG ----------
  // Change this if your backend is on ngrok or different host (include /api)
  const API_BASE = "https://ungregariously-unbangled-braxton.ngrok-free.dev/api";

  const AI_STATUS_ENDPOINT = '/ai/status/';
  const AI_QUERY_ENDPOINT = '/ai/query/';
  const TYPING_MIN_TIME = 600; // ms minimum typing indicator
  // ----------------------------

  // helpers
  const $ = id => document.getElementById(id);
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function scrollToBottom(el) { if (!el) return; el.scrollTop = el.scrollHeight; }
  function nowMs() { return new Date().getTime(); }

  // DOM refs (will be assigned after DOM ready)
  let aiChatContainer, aiChatToggle, aiChatMessages, aiChatInput, aiSendBtn, aiCloseBtn, aiStatusP;

  // state
  let isAIChatOpen = false;
  let pendingRequest = null;

  // init refs safely
  function bindRefs() {
    aiChatContainer = $('aiChatContainer');
    aiChatToggle = $('aiChatToggle');
    aiChatMessages = $('aiChatMessages');
    aiChatInput = $('aiChatInput');
    aiSendBtn = document.querySelector('.ai-send-btn') || $('aiChatSend');
    aiCloseBtn = document.querySelector('.ai-close-btn');
    aiStatusP = aiChatContainer ? aiChatContainer.querySelector('.ai-info p') : null;
  }

  // UI helpers (do not change structure)
  function addUserMessage(text) {
    if (!aiChatMessages) return;
    const div = document.createElement('div');
    div.className = 'ai-message';
    div.innerHTML = `
      <div class="message-content" style="margin-left: auto; background: linear-gradient(135deg, #0099cc, #00d4ff); border-radius: 15px; border-top-right-radius: 5px;">
        <p>${escapeHtml(text)}</p>
      </div>
      <div class="message-avatar" style="background: linear-gradient(135deg, #ff6b6b, #ee5a24);">
        <i class="fas fa-user"></i>
      </div>
    `;
    aiChatMessages.appendChild(div);
    scrollToBottom(aiChatMessages);
  }

  function addBotMessage(text) {
    if (!aiChatMessages) return;
    const div = document.createElement('div');
    div.className = 'ai-message ai-bot-message';
    div.innerHTML = `
      <div class="message-avatar">
        <i class="fas fa-robot"></i>
      </div>
      <div class="message-content">
        <p>${escapeHtml(text)}</p>
      </div>
    `;
    aiChatMessages.appendChild(div);
    scrollToBottom(aiChatMessages);
  }

  function showTypingIndicator() {
    if (!aiChatMessages) return;
    removeTypingIndicator();
    const typingDiv = document.createElement('div');
    typingDiv.className = 'ai-message ai-bot-message';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `
      <div class="message-avatar">
        <i class="fas fa-robot"></i>
      </div>
      <div class="message-content">
        <div class="typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    aiChatMessages.appendChild(typingDiv);
    scrollToBottom(aiChatMessages);
  }

  function removeTypingIndicator() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
  }

  function setStatusText(text) {
    if (aiStatusP) aiStatusP.textContent = text;
  }

  // Backend calls
  async function checkBackendReady() {
    try {
      const res = await fetch(API_BASE + AI_STATUS_ENDPOINT, { method: 'GET' });
      if (!res.ok) {
        setStatusText('Offline');
        return false;
      }
      const json = await res.json();
      // backend expected: { ai_ready: true/false, model: '...' } or similar
      setStatusText(json.ai_ready ? 'Online' : 'Ready');
      return Boolean(json.ai_ready);
    } catch (err) {
      setStatusText('Offline');
      return false;
    }
  }

  async function postQueryToBackend(message) {
    // returns { ok: boolean, data/error }
    try {
      const res = await fetch(API_BASE + AI_QUERY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      if (!res.ok) {
        const text = await res.text().catch(()=> '');
        return { ok: false, error: `HTTP ${res.status}: ${text || res.statusText}` };
      }
      const json = await res.json();
      return { ok: true, data: json };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  // main send function (keeps same name used by HTML onclick)
  window.sendAIMessage = async function () {
    bindRefs();
    if (!aiChatInput) return;
    const message = aiChatInput.value.trim();
    if (!message) return;

    // disable send while pending
    if (pendingRequest) return;
    aiSendBtn && aiSendBtn.classList.add('loading');

    addUserMessage(message);
    aiChatInput.value = '';
    showTypingIndicator();

    const start = nowMs();
    pendingRequest = postQueryToBackend(message);
    const result = await pendingRequest;
    const elapsed = nowMs() - start;
    const needDelay = Math.max(0, TYPING_MIN_TIME - elapsed);
    // ensure typing shows for at least TYPING_MIN_TIME so UI feels natural
    await new Promise(r => setTimeout(r, needDelay));
    removeTypingIndicator();
    aiSendBtn && aiSendBtn.classList.remove('loading');
    pendingRequest = null;

    if (!result.ok) {
      addBotMessage('Server error or network issue. Try again later.');
      console.error('AI query error:', result.error);
      setStatusText('Error');
      return;
    }

    const d = result.data;
    // Backend response shapes may vary. Try common keys:
    // preferred: { success: true, response: "text..." }
    // fallback: { response: "text..." } or { message: "..." }
    let reply = '';
    if (d == null) {
      reply = 'No response from AI.';
    } else if (typeof d === 'string') {
      reply = d;
    } else if (d.response) {
      reply = d.response;
    } else if (d.reply) {
      reply = d.reply;
    } else if (d.message) {
      reply = d.message;
    } else if (d.data && d.data.response) {
      reply = d.data.response;
    } else {
      // try to stringify small object
      try { reply = JSON.stringify(d).slice(0, 1000); } catch(e) { reply = 'AI returned unexpected format.'; }
    }

    addBotMessage(reply);
    setStatusText('Online');
  };

  // toggle function (keeps same name used by HTML onclick)
  window.toggleAIChat = function () {
    bindRefs();
    if (!aiChatContainer) return;
    isAIChatOpen = !isAIChatOpen;
    if (isAIChatOpen) {
      aiChatContainer.classList.add('active');
      aiChatContainer.style.display = 'flex';
      aiChatToggle && (aiChatToggle.style.opacity = '0.7');
      // focus input
      setTimeout(()=> { try { aiChatInput && aiChatInput.focus(); } catch(e){} }, 40);
    } else {
      aiChatContainer.classList.remove('active');
      aiChatContainer.style.display = 'none';
      aiChatToggle && (aiChatToggle.style.opacity = '1');
    }
  };

  // Attach Enter key handler and outside-click close (keeps default behaviour)
  function attachUIHandlers() {
    bindRefs();
    if (aiChatInput) {
      // remove previous handler if exists (avoid duplicates)
      aiChatInput.removeEventListener('keypress', inputKeyHandler);
      aiChatInput.addEventListener('keypress', inputKeyHandler);
    }

    // outside click close
    document.removeEventListener('click', outsideClickHandler);
    document.addEventListener('click', outsideClickHandler);

    // close icon (if exists) should toggle as well
    if (aiCloseBtn) {
      aiCloseBtn.removeEventListener('click', closeBtnHandler);
      aiCloseBtn.addEventListener('click', closeBtnHandler);
    }
  }

  function inputKeyHandler(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      window.sendAIMessage();
    }
  }

  function outsideClickHandler(e) {
    bindRefs();
    if (!isAIChatOpen) return;
    if (!aiChatContainer) return;
    if (aiChatContainer.contains(e.target)) return;
    if (aiChatToggle && aiChatToggle.contains(e.target)) return;
    // clicked outside and chat is open -> close
    window.toggleAIChat();
  }

  function closeBtnHandler(e) {
    e.preventDefault();
    e.stopPropagation();
    if (isAIChatOpen) window.toggleAIChat();
  }

  // init on DOM ready
  async function init() {
    bindRefs();
    // ensure hidden (UI may already be hidden by CSS, this is safe)
    try {
      if (aiChatContainer) {
        aiChatContainer.style.display = 'none';
        aiChatContainer.classList.remove('active');
      }
    } catch (e) { /* ignore */ }

    attachUIHandlers();

    // quick status probe (non-blocking)
    const ok = await checkBackendReady();
    if (!ok) {
      // backend not ready - display offline but do not disable UI
      setStatusText('Offline');
      console.warn('AI backend not reachable at', API_BASE + AI_STATUS_ENDPOINT);
    }

    // make sure send button reference exists (some themes may not have class)
    if (!aiSendBtn) {
      aiSendBtn = document.querySelector('.ai-send-btn');
      if (aiSendBtn) {
        aiSendBtn.addEventListener('click', (ev)=>{ ev.preventDefault(); window.sendAIMessage(); });
      }
    }
  }

  // run init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

})();
