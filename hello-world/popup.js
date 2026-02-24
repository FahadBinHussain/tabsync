// Pure fetch test — no browser API used at all
// All DOM lookups inside event handlers so they run after DOM is ready

document.addEventListener('DOMContentLoaded', function() {
  var urlInput = document.getElementById('url');
  var btn      = document.getElementById('btn');
  var status   = document.getElementById('status');

  if (!status) { console.error('[hw] status element not found!'); return; }

  // Load saved URL from localStorage
  try { urlInput.value = localStorage.getItem('hw_url') || ''; } catch(e) {}

  btn.onclick = function() {
    var url = urlInput.value.trim();
    if (!url) { show(status, 'err', 'Enter a URL first.'); return; }

    try { localStorage.setItem('hw_url', url); } catch(e) {}

    show(status, '', '⏳ Fetching ' + url + ' …');
    console.log('[hw] fetching', url);

    fetch(url, { method: 'GET' })
      .then(function(res) {
        console.log('[hw] status:', res.status);
        return res.text().then(function(body) {
          console.log('[hw] body:', body.slice(0, 200));
          show(status, res.ok ? 'ok' : 'err', 'HTTP ' + res.status + '\n' + body.slice(0, 500));
        });
      })
      .catch(function(e) {
        console.log('[hw] error:', String(e));
        show(status, 'err', 'Error: ' + String(e));
      });
  };
});

function show(el, cls, msg) {
  el.textContent = msg;
  el.style.color = cls === 'ok' ? 'green' : cls === 'err' ? 'red' : '#333';
  el.style.fontFamily = 'monospace';
  el.style.whiteSpace = 'pre-wrap';
  el.style.wordBreak = 'break-all';
  el.style.fontSize = '12px';
  el.style.marginTop = '10px';
}
