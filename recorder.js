/* recorder.js
   Saves the current session to this browser so index.html can show it next time.
   Add this one line just before </body> in legs.html, chest.html and arms.html:

       <script src="recorder.js"></script>

   It works out which day it is from the filename, so the line is identical in all three.
   Nothing is uploaded anywhere. Everything stays in this browser's localStorage.
*/
(function(){
  var path = location.pathname.toLowerCase();
  var day = /legs/.test(path)  ? 'Legs'
          : /chest/.test(path) ? 'Chest'
          : /arms/.test(path)  ? 'Arms'
          : null;
  if(!day) return;

  var KEY = 'workoutHistory';

  // Set bubbles have gone by a few different class names across planner versions,
  // so match all of them and let the browser dedupe.
  var ALL = '.b, .pip, .bubble, .setpip, .set-pip';
  var ON  = '.b.on, .pip.on, .bubble.on, .setpip.on, .set-pip.on, .b.done, .pip.done, .bubble.done';

  function stamp(){
    var d = new Date();
    return d.getFullYear() + '-' +
           String(d.getMonth()+1).padStart(2,'0') + '-' +
           String(d.getDate()).padStart(2,'0');
  }

  function weights(){
    var out = [];
    document.querySelectorAll('.ex, .card, .exercise, .exblock').forEach(function(ex){
      var n = ex.querySelector('.exname, .name, .title, h3');
      if(!n) return;
      var vals = [];
      ex.querySelectorAll('input').forEach(function(i){
        var v = (i.value || '').trim();
        if(v) vals.push(v);
      });
      if(vals.length) out.push({ name: n.textContent.trim().replace(/\s+/g,' '), w: vals });
    });
    return out;
  }

  function save(){
    var total = document.querySelectorAll(ALL).length;
    var done  = document.querySelectorAll(ON).length;
    if(!done) return;

    var hist = [];
    try { hist = JSON.parse(localStorage.getItem(KEY)) || []; } catch(e){}

    var date = stamp();
    var rec = { day: day, date: date, done: done, total: total,
                weights: weights(), updated: Date.now() };

    var i = -1;
    for(var k = 0; k < hist.length; k++){
      if(hist[k].date === date && hist[k].day === day){ i = k; break; }
    }
    if(i >= 0) hist[i] = rec; else hist.push(rec);
    if(hist.length > 60) hist = hist.slice(-60);

    try { localStorage.setItem(KEY, JSON.stringify(hist)); } catch(e){}
  }

  var t;
  function queue(){ clearTimeout(t); t = setTimeout(save, 400); }
  document.addEventListener('click',  queue, true);
  document.addEventListener('change', queue, true);
  document.addEventListener('input',  queue, true);
  window.addEventListener('pagehide', save);
})();
