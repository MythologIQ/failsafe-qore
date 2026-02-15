
document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    const CONFIG = {
        apiEval: '/api/qore/evaluate',
        apiAsk: '/api/zo/ask',
        defaultPersona: 'systems',
        defaultTemplate: 'fast'
    };

    // --- State ---
    const state = {
        isProcessing: false
    };

    // --- Elements ---
    const consoleLog = document.querySelector('.console-output');
    const cmdInput = document.getElementById('cmd-input');
    const sendBtn = document.getElementById('send-cmd-btn');
    const debugLight = document.querySelector('.led');
    const tankFill = document.querySelector('.tank-fill');
    const tankLabel = document.querySelector('.health-sub');
    const errorText = document.querySelector('.health-value-overlay');
    const arcFill = document.querySelector('.arc-fill');
    const sliderThumb = document.querySelector('.slider-thumb');
    const sliderFill = document.querySelector('.slider-fill');
    const sliderVal = document.querySelector('.health-value-large');
    const projProgress = document.querySelector('.project-progress-fill');

    // --- Utilities ---
    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function appendLog(role, text, type = 'info') {
        if (!consoleLog) return;
        
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        const div = document.createElement('div');
        div.className = 'log-entry';
        
        // Styling based on role
        let roleSpan = '';
        if (role === 'System') roleSpan = `<span class="log-sys">[System]</span>`;
        else if (role === 'Agent') roleSpan = `<span class="log-agent">[Agent]</span>`;
        else if (role === 'User') roleSpan = `<span style="color: var(--accent-gold); font-weight:600;">[User]</span>`;
        else roleSpan = `<span class="log-ts">[${role}]</span>`;

        // Content styling
        let content = escapeHtml(text);
        if (type === 'error') content = `<span style="color: var(--accent-red);">${content}</span>`;
        if (type === 'success') content = `<span style="color: var(--accent-green);">${content}</span>`;
        if (type === 'code') content = `<pre style="margin:4px 0; color:var(--text-muted); font-size:0.65rem;">${content}</pre>`;

        div.innerHTML = `<span class="log-ts">[${timestamp}]</span> ${roleSpan} ${content}`;
        consoleLog.appendChild(div);
        consoleLog.scrollTop = consoleLog.scrollHeight;
    }

    function constructPromptPackage(intent) {
        // Simplified version of IntentAssistant.generate
        return [
            '# mobile-command',
            'prompt_pipeline:',
            `  intent: "${intent.replace(/"/g, "'")}"`,
            `  context: "Mobile Console Session"`,
            `  persona: "${CONFIG.defaultPersona}"`,
            `  template_deck: "${CONFIG.defaultTemplate}"`,
            '  constraints:',
            '    - "concise output"',
            '    - "mobile optimized"'
        ].join('\n');
    }

    async function handleCommand() {
        const input = String(cmdInput.value || '').trim();
        if (!input || state.isProcessing) return;

        // UI Reset
        cmdInput.value = '';
        state.isProcessing = true;
        sendBtn.disabled = true;
        if(debugLight) debugLight.classList.add('on');

        // 1. Log User Input
        appendLog('User', input);

        try {
            // 2. Construct Prompt Package
            const promptPackage = constructPromptPackage(input);
            // Optional: Log package construction? kept silent for cleaner mobile view, 
            // or maybe a small system note.
            // appendLog('System', 'Packaging intent...', 'info');

            // 3. Governance Check
            appendLog('System', 'Verifying policy compliance...', 'info');
            
            const evalPayload = {
                requestId: `mob-${Date.now()}`,
                actorId: 'did:myth:mobile:operator',
                action: 'mobile.prompt',
                targetPath: 'repo://mobile/console',
                content: promptPackage
            };

            const evalRes = await fetch(CONFIG.apiEval, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(evalPayload)
            });

            if (!evalRes.ok) throw new Error(`Governance API error: ${evalRes.status}`);
            
            const evalData = await evalRes.json();
            const decision = evalData.decision || 'UNKNOWN';

            if (decision === 'DENY' || decision === 'ESCALATE') {
                appendLog('System', `Governance Blocked: ${decision}`, 'error');
                if (evalData.reasons) appendLog('System', evalData.reasons.join(', '), 'error');
                return; // Stop
            }

            // 4. Send to Agent (Zo)
            appendLog('System', 'Uplink established. Transmitting...', 'success');
            
            const zoPayload = { prompt: promptPackage };
            const zoRes = await fetch(CONFIG.apiAsk, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(zoPayload)
            });

            if (!zoRes.ok) throw new Error(`Agent API error: ${zoRes.status}`);

            const zoData = await zoRes.json();
            
            // Extract Content (flexible parsing)
            let reply = '';
            if (zoData.choices && zoData.choices[0]?.message?.content) {
                reply = zoData.choices[0].message.content;
            } else if (zoData.result?.content) {
                reply = zoData.result.content;
            } else if (typeof zoData.result === 'string') {
                reply = zoData.result;
            } else {
                reply = JSON.stringify(zoData, null, 2);
            }

            appendLog('Agent', reply);

        } catch (err) {
            appendLog('System', `Execution Error: ${err.message}`, 'error');
        } finally {
            state.isProcessing = false;
            sendBtn.disabled = false;
            if(debugLight) debugLight.classList.remove('on');
            // Re-focus input for rapid chaining
            cmdInput.focus();
        }
    }

    // --- Event Listeners ---
    if (sendBtn) {
        sendBtn.addEventListener('click', handleCommand);
    }

    if (cmdInput) {
        cmdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleCommand();
        });
    }

    // --- Background Simulations (Cosmetic) ---
    // Kept (mostly) intact but reduced freq since we have real interactions now
    
    // Console Heartbeat (Reduced freq)
    if (consoleLog) {
        setInterval(() => {
            if (Math.random() > 0.9 && !state.isProcessing) { // Only idle chatter
                const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
                const msgs = [
                    `<span class="log-sys">[System]</span> Background sync active.`,
                    `<span class="log-sys">[System]</span> Latency: 24ms`,
                ];
                const msg = msgs[Math.floor(Math.random() * msgs.length)];
                const div = document.createElement('div');
                div.className = 'log-entry';
                div.innerHTML = `<span class="log-ts">[${timestamp}]</span> ${msg}`;
                consoleLog.appendChild(div);
                if (!state.isProcessing) consoleLog.scrollTop = consoleLog.scrollHeight;
            }
        }, 12000); // Slower
    }

    // Monitor Animations (Preserved)
    if (tankFill && tankLabel) {
        setInterval(() => {
            const val = 15 + Math.floor(Math.random() * 10);
            tankFill.style.height = `${val}%`;
            tankLabel.textContent = `${val}% Full`;
        }, 4000);
    }

    if(errorText && arcFill) {
        setInterval(() => {
             const val = 3 + Math.floor(Math.random() * 4);
             errorText.textContent = `${val}%`;
             arcFill.style.opacity = (0.8 + Math.random() * 0.2).toFixed(2);
        }, 5000);
    }

    if(sliderThumb && sliderFill && sliderVal) {
        setInterval(() => {
             const val = 42 + Math.floor(Math.random() * 8); 
             sliderThumb.style.left = `${val}%`;
             sliderFill.style.width = `${val}%`;
             sliderVal.textContent = `${val}%`;
        }, 4500);
    }
  
    // Initial Project Progress
    if (projProgress) {
        setTimeout(() => {
            projProgress.style.width = '66%';
        }, 1000);
    }
});
