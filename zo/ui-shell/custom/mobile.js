document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.tab-content');
  const navItems = document.querySelectorAll('.nav-item');

  function switchTab(targetId) {
    // Hide all tabs
    tabs.forEach(tab => tab.classList.remove('active'));
    
    // Show target tab
    const targetTab = document.getElementById(targetId);
    if (targetTab) {
      targetTab.classList.add('active');
    }

    // Update nav state
    navItems.forEach(item => {
      if (item.dataset.target === targetId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = item.dataset.target || item.closest('.nav-item').dataset.target;
      switchTab(targetId);
    });
  });

  // Mock Simulations for "Live" feel
  
  // Console Heartbeat
  const consoleLog = document.querySelector('.console-output');
  if (consoleLog) {
    setInterval(() => {
      if (Math.random() > 0.8) {
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        const msgs = [
          `<span class="log-sys">[System]</span> Heartbeat check: OK`,
          `<span class="log-agent">[Agent]</span> Verifying dependencies...`,
          `<span class="log-sys">[System]</span> Resource load balanced.`,
          `<span class="log-agent">[Scrivener]</span> Context synchronizing...`,
        ];
        const msg = msgs[Math.floor(Math.random() * msgs.length)];
        const div = document.createElement('div');
        div.className = 'log-entry';
        div.innerHTML = `<span class="log-ts">[${timestamp}]</span> ${msg}`;
        consoleLog.appendChild(div);
        consoleLog.scrollTop = consoleLog.scrollHeight;
      }
    }, 3000);
  }

  // Sentinel Pulsing Logic (Visual only, CSS handles animation)
  // We can randomly toggle the debug status light
  const debugLight = document.querySelector('.led');
  if (debugLight) {
    // In normal state it's off or dim. If we want to simulate issues:
    // debugLight.classList.add('on');
  }

  // Randomize Load
  const loadBar = document.getElementById('verdict-load-bar');
  if (loadBar) {
    setInterval(() => {
      const height = 40 + Math.random() * 40;
      loadBar.style.height = `${height}%`;
    }, 2000);
  }
});
