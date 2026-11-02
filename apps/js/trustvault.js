'use strict';


var ST = {
  docs:[], bens:[], recs:[], witnesses:[], guardians:[], checkins:[],
  lastCheckin:null, ciInterval:14, ciWarn:7,
  deathCert:null,
  profile:{ name:'', email:'' },
  viewDoc:null
};
var SKEY = 'trustvault_v2';

function loadST() {
  var r = localStorage.getItem(SKEY);
  if (!r) return;
  try {
    var d = JSON.parse(r);
    Object.assign(ST, d);
    if (ST.lastCheckin) ST.lastCheckin = new Date(ST.lastCheckin);
    ST.checkins = (ST.checkins||[]).map(function(c){ return Object.assign({},c,{time:new Date(c.time)}); });
  } catch(e) {}
}
function saveST() { localStorage.setItem(SKEY, JSON.stringify(ST)); updateVaultStats(); }

// ── CRYPTO ──
function deriveKey(pass, salt) {
  var enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey'])
    .then(function(km) {
      return crypto.subtle.deriveKey({name:'PBKDF2',salt:salt,iterations:100000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    });
}
function encryptStr(text, pass) {
  var enc = new TextEncoder(), salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  return deriveKey(pass, salt).then(function(k) { return crypto.subtle.encrypt({name:'AES-GCM',iv:iv},k,enc.encode(text)); })
    .then(function(ct) {
      var b = new Uint8Array(salt.length+iv.length+ct.byteLength);
      b.set(salt,0); b.set(iv,16); b.set(new Uint8Array(ct),28);
      return btoa(String.fromCharCode.apply(null,b));
    });
}
function decryptStr(b64, pass) {
  var b = Uint8Array.from(atob(b64),function(c){return c.charCodeAt(0);}), salt=b.slice(0,16), iv=b.slice(16,28), ct=b.slice(28);
  return deriveKey(pass,salt).then(function(k){ return crypto.subtle.decrypt({name:'AES-GCM',iv:iv},k,ct); })
    .then(function(pt){ return new TextDecoder().decode(pt); });
}

// ── NAV ──
function nav(p) {
  document.querySelectorAll('.page').forEach(function(el){el.classList.remove('active');});
  document.querySelectorAll('.nav-item').forEach(function(el){el.classList.remove('active');});
  var pg = document.getElementById('pg-'+p); if(pg) pg.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(function(el){
    if(el.getAttribute('onclick')&&el.getAttribute('onclick').indexOf("'"+p+"'")>=0) el.classList.add('active');
  });
  if(p==='docs')         renderDocsList();
  if(p==='recipients')   renderRecsList();
  if(p==='will')         renderCreateRecs();
  if(p==='beneficiaries') renderBens();
  if(p==='witnesses')    renderWitnesses();
  if(p==='checkin')      renderCiHistory();
  if(p==='deathcert')    renderDeathCert();
  if(p==='vault')        updateVaultStats();
  if(p==='trustless')    renderAuditLog();
  if(p==='guardian-network') {loadMN();updateMNDisplay();}
  if(p==='verification') renderVerification();
}
function openM(id){document.getElementById(id).classList.add('open');}
function closeM(id){document.getElementById(id).classList.remove('open');}

function _coreEnterApp() {
  document.getElementById('landing').style.display='none';
  document.getElementById('app').style.display='block';
  loadST(); refreshAll(); startTimers();
}
function backLanding() {
  document.getElementById('app').style.display='none';
  document.getElementById('lock-screen').style.display='none';
  document.getElementById('landing').style.display='flex';
}

// ── DOCUMENTS ──
function createDoc() {
  var title=document.getElementById('c-title').value.trim(),
      content=document.getElementById('c-content').value.trim(),
      pass=document.getElementById('c-pass').value,
      pass2=document.getElementById('c-pass2').value,
      type=document.getElementById('c-type').value,
      delay=parseInt(document.getElementById('c-delay').value);
  if(!title)   return toast('Enter a document title.','error');
  if(!content) return toast('Write some content.','error');
  if(!pass)    return toast('Enter an encryption passphrase.','error');
  if(pass!==pass2) return toast('Passphrases do not match.','error');
  var recs=[];
  document.querySelectorAll('.rc-chk:checked').forEach(function(cb){recs.push(cb.value);});
  encryptStr(content,pass).then(function(enc){
    ST.docs.push({
      id:Date.now().toString(36)+Math.random().toString(36).slice(2),
      title:title,type:type,delay:delay,encrypted:enc,recs:recs,
      created:new Date().toISOString(),status:'active',signed:true
    });
    saveST(); updateStats(); updateDashboardSteps();
    toast('Document encrypted and signed.','success');
    document.getElementById('c-title').value='';
    document.getElementById('c-content').value='';
    document.getElementById('c-pass').value='';
    document.getElementById('c-pass2').value='';
    nav('docs');
  }).catch(function(e){toast('Encryption failed: '+e.message,'error');});
}
function previewDoc(){var c=document.getElementById('c-content').value;if(!c)return toast('Write content first.','error');alert('PREVIEW:\n\n'+c);}

function renderDocsList() {
  var el=document.getElementById('docs-list');
  if(!ST.docs.length){el.innerHTML='<p class="txt-muted">No documents yet. <span class="txt-blue" data-on-click="nav(\'will\')">Create your first</span></p>';return;}
  el.innerHTML=ST.docs.map(function(d){
    return '<div class="card"><div class="card-title">'+esc(d.title)+' <span class="badge badge-'+(d.signed?'signed':'draft')+'">'+(d.signed?'signed':'draft')+'</span></div>'+
    '<div class="card-meta">'+d.type+' &bull; Trigger after '+d.delay+'d &bull; '+d.recs.length+' recipient(s) &bull; '+new Date(d.created).toLocaleDateString()+'</div>'+
    '<div class="enc-box"><span class="enc-lbl">Encrypted</span>'+d.encrypted.substring(0,80)+'...</div>'+
    '<div class="card-actions"><button class="btn btn-ghost btn-sm" data-on-click="viewDoc(\''+d.id+'\')">Decrypt &amp; View</button>'+
    '<button class="btn btn-ghost btn-sm" data-on-click="editDoc(\'+d.id+\')">&#9998; Edit</button>'+
    '<button class="btn btn-ghost btn-sm" data-on-click="copyEl2(\''+d.id+'\')">Copy Encrypted</button>'+
    '<button class="btn btn-bad btn-sm" data-on-click="deleteDoc(\''+d.id+'\')">Delete</button></div></div>';
  }).join('');
}
function viewDoc(id){
  var d=ST.docs.find(function(x){return x.id===id;});if(!d)return;
  ST.viewDoc=d;
  document.getElementById('mv-title').textContent=d.title;
  document.getElementById('mv-sub').textContent=d.type+' \u2022 '+new Date(d.created).toLocaleDateString();
  document.getElementById('mv-content').style.display='none';
  document.getElementById('mv-pass').value='';
  openM('m-view');setTimeout(function(){document.getElementById('mv-pass').focus();},200);
}
function decryptView(){
  var d=ST.viewDoc,p=document.getElementById('mv-pass').value;
  if(!p)return toast('Enter passphrase.','error');
  decryptStr(d.encrypted,p).then(function(txt){
    document.getElementById('mv-text').textContent=txt;
    document.getElementById('mv-content').style.display='block';
    toast('Decrypted.','success');
  }).catch(function(){toast('Wrong passphrase or corrupted data.','error');});
}
function copyEl2(id){var d=ST.docs.find(function(x){return x.id===id;});if(d)navigator.clipboard.writeText(d.encrypted).then(function(){toast('Copied.','success');});}
function deleteDoc(id){if(!confirm('Permanently delete this document?'))return;ST.docs=ST.docs.filter(function(d){return d.id!==id;});saveST();renderDocsList();updateStats();toast('Deleted.','success');}

function renderCreateRecs(){
  var el=document.getElementById('c-recs');
  if(!ST.recs.length){el.innerHTML='<p class="txt-muted" style="font-size:13px">No recipients yet. <span class="txt-blue" data-on-click="nav(\'recipients\')">Add recipients first</span></p>';return;}
  el.innerHTML=ST.recs.map(function(r){
    return '<label style="display:flex;align-items:center;gap:10px;padding:8px 0;cursor:pointer;font-size:13.5px;border-bottom:1px solid var(--border)">'+
    '<input type="checkbox" class="rc-chk" value="'+r.id+'" style="accent-color:var(--blue);width:14px;height:14px">'+
    '<span style="font-weight:600">'+esc(r.name)+'</span><span style="color:var(--muted);font-size:12px">'+esc(r.email)+'</span></label>';
  }).join('');
}

// ── BENEFICIARIES ──
function addBen(){
  var n=document.getElementById('b-name').value.trim(),
      e=document.getElementById('b-email').value.trim(),
      r=document.getElementById('b-rel').value,
      p=parseInt(document.getElementById('b-pct').value)||0,
      notes=document.getElementById('b-notes').value.trim();
  if(!n)return toast('Enter a name.','error');
  if(p<1||p>100)return toast('Allocation must be 1-100%.','error');
  var total=ST.bens.reduce(function(s,b){return s+b.pct;},0);
  if(total+p>100)return toast('Total allocation would exceed 100%. Remaining: '+(100-total)+'%','error');
  ST.bens.push({id:Date.now().toString(36),name:n,email:e,rel:r,pct:p,notes:notes});
  saveST();renderBens();updateStats();updateDashboardSteps();
  document.getElementById('b-name').value='';document.getElementById('b-email').value='';
  document.getElementById('b-pct').value='';document.getElementById('b-notes').value='';
  toast('Beneficiary added: '+n,'success');
}
function delBen(id){ST.bens=ST.bens.filter(function(b){return b.id!==id;});saveST();renderBens();updateStats();updateDashboardSteps();toast('Removed.','success');}

// Color palette for beneficiary bars
var BAR_COLORS=['#2d6a9f','#16a34a','#d97706','#7c3aed','#dc2626','#0891b2','#be185d'];

function renderBens(){
  var total=ST.bens.reduce(function(s,b){return s+b.pct;},0);
  var tb=document.getElementById('b-total');if(tb)tb.textContent=total+'%';
  var bar=document.getElementById('b-alloc-bar');
  if(bar){bar.style.width=Math.min(100,total)+'%';bar.style.background=total>100?'#dc2626':total===100?'#15803d':'#2d6a9f';}
  var msg=document.getElementById('b-alloc-msg');
  if(msg){
    if(total===100) msg.innerHTML='<span class="txt-ok">&#10003; 100% allocated — fully distributed</span>';
    else if(total>100) msg.innerHTML='<span class="txt-bad">&#9888; Over 100% — reduce allocations</span>';
    else msg.innerHTML='<span style="color:var(--muted)">'+( 100-total)+'% remaining to allocate</span>';
  }
  var el=document.getElementById('b-list');
  if(!el)return;
  if(!ST.bens.length){el.innerHTML='<p class="txt-muted">No beneficiaries yet.</p>';return;}
  el.innerHTML=ST.bens.map(function(b,i){
    var col=BAR_COLORS[i%BAR_COLORS.length];
    return '<div class="b-card">'+
      '<div class="b-header"><div><div class="b-name">'+esc(b.name)+'</div><div style="font-size:12px;color:var(--muted)">'+b.rel+(b.email?' &bull; '+esc(b.email):'')+(b.notes?' &bull; '+esc(b.notes):'')+'</div></div>'+
      '<div style="display:flex;align-items:center;gap:12px"><div class="b-pct">'+b.pct+'%</div>'+
      '<button class="btn btn-bad btn-sm" data-on-click="delBen(\''+b.id+'\')">Remove</button></div></div>'+
      '<div class="b-bar-wrap"><div class="b-bar" style="width:'+b.pct+'%;background:'+col+'"></div></div>'+
      '<div class="b-meta">'+b.pct+'% allocation</div></div>';
  }).join('');
  // update dashboard beneficiary distribution bars
  var db=document.getElementById('dash-bens');
  if(db){
    if(!ST.bens.length){db.innerHTML='<p class="txt-muted">No beneficiaries yet.</p>';return;}
    db.innerHTML=ST.bens.map(function(b,i){
      var col=BAR_COLORS[i%BAR_COLORS.length];
      return '<div class="dist-row">'+
        '<div class="dist-name">'+esc(b.name)+'<div style="font-size:11px;color:var(--muted)">'+b.rel+'</div></div>'+
        '<div class="dist-bar-wrap"><div class="dist-bar-inner" style="width:'+b.pct+'%;background:'+col+'"></div></div>'+
        '<div class="dist-pct">'+b.pct+'%</div></div>';
    }).join('');
  }
  // update s-alloc
  var sa=document.getElementById('s-alloc');
  if(sa)sa.textContent=total+'%';
}

// ── WITNESSES ──
function addWitness(){
  var n=document.getElementById('w-name').value.trim(),e=document.getElementById('w-email').value.trim(),r=document.getElementById('w-role').value;
  if(!n||!e)return toast('Name and email required.','error');
  ST.witnesses.push({id:Date.now().toString(36),name:n,email:e,role:r,confirmed:false,confirmedAt:null});
  saveST();renderWitnesses();updateStats();updateDashboardSteps();
  document.getElementById('w-name').value='';document.getElementById('w-email').value='';
  toast('Witness added: '+n,'success');
}
function confirmWitness(id){
  var w=ST.witnesses.find(function(x){return x.id===id;});
  if(!w)return;
  w.confirmed=true;w.confirmedAt=new Date().toISOString();
  saveST();renderWitnesses();updateDashboardSteps();
  toast('Witness '+w.name+' confirmed!','success');
}
function delWitness(id){ST.witnesses=ST.witnesses.filter(function(w){return w.id!==id;});saveST();renderWitnesses();updateStats();updateDashboardSteps();}

function renderWitnesses(){
  var confirmed=ST.witnesses.filter(function(w){return w.confirmed;}).length;
  var total=ST.witnesses.length;
  var cb=document.getElementById('w-count-badge');
  if(cb){cb.textContent=confirmed+' / '+Math.max(2,total)+' confirmed';cb.className='badge '+(confirmed>=2?'badge-confirmed':'badge-pending');}
  var wc=document.getElementById('w-count');if(wc)wc.textContent=total;
  for(var i=0;i<2;i++){var sl=document.getElementById('ws'+i);if(sl)sl.className='wp-slot'+(i<confirmed?' filled':'');}
  var sm=document.getElementById('w-status-msg');
  if(sm){
    if(confirmed>=2) sm.innerHTML='<span class="txt-ok">&#10003; Both witnesses confirmed — will is ready to sign.</span>';
    else if(total<2) sm.innerHTML='Add at least 2 witnesses and have them confirm.';
    else sm.innerHTML=(2-confirmed)+' more confirmation(s) needed.';
  }
  var el=document.getElementById('w-list');if(!el)return;
  if(!ST.witnesses.length){el.innerHTML='<p class="txt-muted">No witnesses added yet.</p>';return;}
  el.innerHTML=ST.witnesses.map(function(w){
    return '<div class="person-card">'+
      '<div class="person-info">'+
        '<div class="person-av'+(w.confirmed?' ok':'')+'">'+w.name[0].toUpperCase()+'</div>'+
        '<div><div class="person-name">'+esc(w.name)+'</div>'+
              '<div class="person-meta">'+w.role+' &bull; '+esc(w.email)+(w.confirmed?' &bull; Confirmed '+new Date(w.confirmedAt).toLocaleDateString():'')+'</div></div>'+
      '</div>'+
      '<div class="person-right">'+
        (w.confirmed?'<span class="badge badge-confirmed">&#10003; Confirmed</span>':'<button class="btn btn-ok btn-sm" data-on-click="confirmWitness(\''+w.id+'\')">Confirm</button>')+
        ' <button class="btn btn-bad btn-sm" data-on-click="delWitness(\''+w.id+'\')">Remove</button>'+
      '</div></div>';
  }).join('');
}

function exportWitnessReq(){
  if(!ST.docs.length)return toast('Create a document first.','error');
  var payload={type:'trustvault_witness_request',generated:new Date().toISOString(),requester:ST.profile.name||'Estate Owner',documents:ST.docs.map(function(d){return{id:d.id,title:d.title,type:d.type,created:d.created};})};
  dlStr(JSON.stringify(payload,null,2),'trustvault-witness-request-'+new Date().toISOString().slice(0,10)+'.json','application/json');
  toast('Witness request file exported.','success');
}

// ── RECIPIENTS ──
function addRec(){
  var n=document.getElementById('r-name').value.trim(),e=document.getElementById('r-email').value.trim(),r=document.getElementById('r-rel').value;
  if(!n||!e)return toast('Name and email required.','error');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))return toast('Enter a valid email.','error');
  ST.recs.push({id:Date.now().toString(36),name:n,email:e,rel:r});
  saveST();renderRecsList();updateStats();
  document.getElementById('r-name').value='';document.getElementById('r-email').value='';
  toast('Recipient added: '+n,'success');
}
function delRec(id){ST.recs=ST.recs.filter(function(r){return r.id!==id;});saveST();renderRecsList();updateStats();}
function renderRecsList(){
  var el=document.getElementById('recs-list');
  if(!ST.recs.length){el.innerHTML='<p class="txt-muted">No recipients yet.</p>';return;}
  el.innerHTML=ST.recs.map(function(r){
    return '<div class="person-card"><div class="person-info"><div class="person-av">'+r.name[0].toUpperCase()+'</div>'+
    '<div><div class="person-name">'+esc(r.name)+'</div><div class="person-meta">'+esc(r.email)+' &bull; '+r.rel+'</div></div></div>'+
    '<button class="btn btn-bad btn-sm" data-on-click="delRec(\''+r.id+'\')">Remove</button></div>';
  }).join('');
}

// ── CHECK-IN ──
function doCheckin(){
  ST.lastCheckin=new Date();ST.checkins.unshift({time:ST.lastCheckin,note:'Manual check-in'});
  if(ST.checkins.length>50)ST.checkins.pop();
  saveST();refreshCiUI();renderCiHistory();toast('Check-in confirmed.','success');
}
function saveCiSettings(){
  ST.ciInterval=parseInt(document.getElementById('ci-interval').value);
  ST.ciWarn=parseInt(document.getElementById('ci-warn').value);
  saveST();
}
function renderCiHistory(){
  var el=document.getElementById('ci-history');if(!el)return;
  if(!ST.checkins.length){el.innerHTML='<div class="hb-row txt-muted">No check-ins yet.</div>';return;}
  el.innerHTML=ST.checkins.slice(0,15).map(function(c){
    return '<div class="hb-row"><span class="txt-ok">&#10003; '+esc(c.note)+'</span><span class="hb-time">'+new Date(c.time).toLocaleString()+'</span></div>';
  }).join('');
}

function refreshCiUI(){
  var now=new Date(),last=ST.lastCheckin,intMs=ST.ciInterval*86400000,dl=last?new Date(last.getTime()+intMs):null;
  ['hPdot','dashPdot','ciDot'].forEach(function(id){
    var el=document.getElementById(id);if(!el)return;
    if(!last){el.className='pdot warn';return;}
    var dLeft=dl?(dl-now)/86400000:0;
    el.className='pdot'+(dLeft<ST.ciWarn?' danger':dLeft<ST.ciWarn*2?' warn':'');
  });
  var ciTxt=document.getElementById('ciStatusTxt'),hTxt=document.getElementById('hCiTxt');
  if(!last){if(ciTxt)ciTxt.textContent='No check-in recorded';if(hTxt)hTxt.textContent='No Check-in';}
  else{var dLeft=dl?Math.max(0,(dl-now)/86400000):0;if(ciTxt)ciTxt.textContent='Active \u2014 '+dLeft.toFixed(1)+'d until deadline';if(hTxt)hTxt.textContent=dLeft.toFixed(0)+'d remaining';}
  var ds=document.getElementById('dashCiSt');if(ds)ds.textContent=!last?'No check-in yet':'Last '+((now-last)/86400000).toFixed(1)+'d ago';
  if(last&&dl){var pct=Math.min(100,((now-last)/(dl-last))*100),clr=pct>80?'#ef4444':pct>60?'#f59e0b':'#22c55e';
    ['ciProg','dashProg'].forEach(function(id){var b=document.getElementById(id);if(b){b.style.width=pct+'%';b.style.background=clr;}});}
  var dle=document.getElementById('ciDline');if(dle&&dl)dle.textContent='Trigger in '+Math.max(0,(dl-now)/86400000).toFixed(1)+'d';
  var dn=document.getElementById('dashNote');if(dn)dn.textContent=!last?'Confirm a check-in to protect your estate.':'Next due by '+(dl?dl.toLocaleDateString():'-');
  var az=document.getElementById('dash-alert');if(az){if(!last)az.innerHTML='<div class="alert alert-warn">No check-in recorded yet.</div>';else if(dl&&(dl-now)/86400000<ST.ciWarn)az.innerHTML='<div class="alert alert-warn">&#9888; Deadline approaching — confirm check-in now!</div>';else az.innerHTML='';}
  var cia=document.getElementById('ci-alert');if(cia){if(!last)cia.innerHTML='<div class="alert alert-info">Set your interval below and confirm your first check-in.</div>';else if(dl&&(dl-now)/86400000<ST.ciWarn)cia.innerHTML='<div class="alert alert-warn">&#9888; Deadline approaching!</div>';else cia.innerHTML='';}
  var sh=document.getElementById('s-hb'),sn=document.getElementById('s-next');
  // not stat items for this page but for future
  var ci=document.getElementById('ci-interval'),cw=document.getElementById('ci-warn');
  if(ci)ci.value=ST.ciInterval;if(cw)cw.value=ST.ciWarn;
}

// ── DEATH CERTIFICATE ──
function previewDC(){
  var f=document.getElementById('dc-file').files[0];if(!f)return;
  var p=document.getElementById('dc-preview');
  p.style.display='block';
  p.innerHTML='<div class="card" style="padding:12px 14px;background:#f0fdf4;border-color:#bbf7d0"><div class="flex ic gap2"><span style="font-size:20px">&#128196;</span><div><div style="font-weight:600;font-size:13.5px">'+esc(f.name)+'</div><div style="font-size:12px;color:var(--muted)">'+(f.size/1024).toFixed(1)+' KB &bull; '+f.type+'</div></div></div></div>';
}

function uploadCert(){
  var f=document.getElementById('dc-file').files[0];
  var executor=document.getElementById('dc-executor').value.trim();
  var dod=document.getElementById('dc-dod').value;
  var notes=document.getElementById('dc-notes').value.trim();
  if(!executor)return toast('Enter executor name.','error');
  if(!dod)return toast('Enter date of death.','error');

  var certData={
    fileName:f?f.name:'(no file selected)',
    executor:executor,dateOfDeath:dod,notes:notes,
    uploadedAt:new Date().toISOString(),verified:true
  };
  if(f){
    var reader=new FileReader();
    reader.onload=function(e){
      certData.fileDataUrl=e.target.result;
      certData.fileSize=f.size;
      ST.deathCert=certData;
      saveST();renderDeathCert();
      toast('Death certificate recorded. Guardian voting now open.','success');
    };
    reader.readAsDataURL(f);
  } else {
    ST.deathCert=certData;
    saveST();renderDeathCert();
    toast('Certificate record saved.','success');
  }
}

function addGuardian(){
  var n=document.getElementById('g-name-in').value.trim();
  if(!n)return toast('Enter guardian name.','error');
  ST.guardians.push({id:Date.now().toString(36),name:n,voted:false,votedAt:null});
  saveST();renderDeathCert();
  document.getElementById('g-name-in').value='';
  toast('Guardian added: '+n,'success');
}
function guardianVote(id){
  var g=ST.guardians.find(function(x){return x.id===id;});if(!g||g.voted)return;
  g.voted=true;g.votedAt=new Date().toISOString();
  saveST();renderDeathCert();toast(g.name+' voted.','success');
}
function delGuardian(id){ST.guardians=ST.guardians.filter(function(g){return g.id!==id;});saveST();renderDeathCert();}

function renderDeathCert(){
  // Step 1 status
  var s1=document.getElementById('dc-s1'),s1t=document.getElementById('dc-s1-title'),s1s=document.getElementById('dc-s1-status');
  if(ST.deathCert){
    if(s1)s1.className='ts-box ts-done';
    if(s1t){s1t.className='ts-title done-title';s1t.textContent='&#10003; Certificate Recorded';}
    if(s1s)s1s.innerHTML='<span class="txt-ok">'+esc(ST.deathCert.fileName)+'</span><br><span style="font-size:11px;color:var(--muted)">Executor: '+esc(ST.deathCert.executor)+' &bull; DOD: '+ST.deathCert.dateOfDeath+'</span>';
    // show cert in card
    var cd=document.getElementById('dc-cert-display');
    if(cd)cd.innerHTML='<div class="alert alert-ok" style="margin-bottom:12px">&#10003; Certificate recorded by '+esc(ST.deathCert.executor)+' on '+new Date(ST.deathCert.uploadedAt).toLocaleDateString()+'<br><span style="font-size:11px;opacity:.8">Date of Death: '+ST.deathCert.dateOfDeath+'</span></div>';
  } else {
    if(s1)s1.className='ts-box';
    if(s1t){s1t.className='ts-title';s1t.textContent='Awaiting Certificate';}
    if(s1s)s1s.textContent='No certificate uploaded';
    var cd=document.getElementById('dc-cert-display');if(cd)cd.innerHTML='';
  }

  // Step 2: Guardian votes
  var voted=ST.guardians.filter(function(g){return g.voted;}).length;
  var required=ST.guardians.length;
  var allVoted=required>0&&voted>=required;
  var s2=document.getElementById('dc-s2'),s2t=document.getElementById('dc-s2-title'),s2s=document.getElementById('dc-s2-status');
  var gvc=document.getElementById('g-vote-count'),gvr=document.getElementById('g-vote-required');
  if(gvc)gvc.textContent=voted;if(gvr)gvr.textContent=required||0;
  if(allVoted){
    if(s2)s2.className='ts-box ts-done';
    if(s2t){s2t.className='ts-title done-title';s2t.textContent='&#10003; All Voted';}
    if(s2s)s2s.textContent=voted+' / '+required+' voted';
  } else if(ST.deathCert&&required>0){
    if(s2)s2.className='ts-box ts-active';
    if(s2t){s2t.className='ts-title';s2t.textContent='Voting In Progress';}
    if(s2s)s2s.textContent=voted+' / '+required+' voted';
  } else {
    if(s2)s2.className='ts-box';
    if(s2t){s2t.className='ts-title';s2t.textContent=required===0?'No Guardians (Skip)':'Awaiting Votes';}
    if(s2s)s2s.textContent=voted+' / '+required+' voted';
  }

  // Render guardian cards
  var gg=document.getElementById('g-grid');
  if(gg){
    if(!ST.guardians.length){gg.innerHTML='<p class="txt-muted" style="font-size:13px">No guardians configured. Distribution will trigger immediately once certificate is uploaded.</p>';}
    else{
      gg.innerHTML=ST.guardians.map(function(g){
        return '<div class="g-card'+(g.voted?' voted':'')+'">'+
          '<div class="g-av'+(g.voted?' gvoted':'')+'">'+g.name[0].toUpperCase()+'</div>'+
          '<div class="g-name">'+esc(g.name)+'</div>'+
          (g.voted?'<div style="font-size:10.5px;color:var(--ok);margin-bottom:6px">&#10003; Voted '+new Date(g.votedAt).toLocaleDateString()+'</div>':'')+ 
          '<button class="g-vote-btn'+(g.voted?' voted':'')+'" data-on-click="'+(g.voted?'':'guardianVote(\''+g.id+'\')')+'">'+(g.voted?'&#10003; Voted':'Vote to Confirm')+'</button>'+
          (!g.voted?'<button class="btn btn-ghost btn-sm" data-on-click="editDoc('+d.id+')">&#9998; Edit</button>'+
    '<button class="btn btn-bad btn-sm" style="width:100%;margin-top:5px" data-on-click="delGuardian(\''+g.id+'\')">Remove</button>':'')+'</div>';
      }).join('');
    }
  }

  // Step 3: Distribution readiness
  var canDistrib=ST.deathCert&&(ST.guardians.length===0||allVoted);
  var s3=document.getElementById('dc-s3'),s3t=document.getElementById('dc-s3-title'),s3s=document.getElementById('dc-s3-status');
  var dds=document.getElementById('dc-dist-status'),ddb=document.getElementById('dc-dist-bens');
  if(canDistrib){
    if(s3)s3.className='ts-box ts-active';
    if(s3t){s3t.className='ts-title';s3t.textContent='Ready to Distribute';}
    if(s3s)s3s.innerHTML='<span class="txt-ok">All conditions met</span>';
    if(dds)dds.style.display='none';
    if(ddb){
      ddb.style.display='block';
      var bb=document.getElementById('dc-ben-bars');
      if(bb){
        if(!ST.bens.length)bb.innerHTML='<p class="txt-muted" style="font-size:13px">No beneficiaries configured. Add them under Beneficiaries.</p>';
        else bb.innerHTML=ST.bens.map(function(b,i){
          var col=BAR_COLORS[i%BAR_COLORS.length];
          return '<div class="dist-row"><div class="dist-name">'+esc(b.name)+'<div style="font-size:11px;color:var(--muted)">'+b.rel+'</div></div>'+
            '<div class="dist-bar-wrap"><div class="dist-bar-inner" style="width:'+b.pct+'%;background:'+col+'"></div></div>'+
            '<div class="dist-pct">'+b.pct+'%</div></div>';
        }).join('');
      }
    }
  } else {
    if(s3)s3.className='ts-box';
    if(s3t){s3t.className='ts-title';s3t.textContent='Pending';}
    if(s3s)s3s.textContent='Waiting for Steps 1 & 2';
    if(dds){dds.style.display='';dds.innerHTML='<p class="txt-muted" style="font-size:13px">Distribution files will be generated here once Steps 1 & 2 are complete.</p>';}
    if(ddb)ddb.style.display='none';
  }
}

function generateDistrib(){
  if(!ST.deathCert)return toast('Upload death certificate first.','error');
  var targets=ST.bens.length?ST.bens:ST.recs.map(function(r){return Object.assign({},r,{pct:null});});
  if(!targets.length)return toast('Add beneficiaries or recipients first.','error');
  var count=0;
  targets.forEach(function(target){
    var docs=ST.docs.filter(function(d){return d.status==='active'&&(d.recs.length===0||d.recs.indexOf(target.id)>=0);});
    if(!docs.length&&ST.docs.length)docs=ST.docs.filter(function(d){return d.status==='active';});
    var payload={
      type:'trustvault_distribution',generated:new Date().toISOString(),
      for_beneficiary:target.name,for_email:target.email||'',
      allocation_pct:target.pct||null,relationship:target.rel||'',
      death_certificate:{executor:ST.deathCert.executor,date_of_death:ST.deathCert.dateOfDeath,uploaded:ST.deathCert.uploadedAt},
      guardian_confirmations:ST.guardians.filter(function(g){return g.voted;}).map(function(g){return{name:g.name,voted_at:g.votedAt};}),
      note:'Open TrustVault (this HTML file) on your device. Go to Vault -> Import and load this file. Then go to Encryption Tools to decrypt each document using the passphrase provided to you.',
      documents:docs.map(function(d){return{id:d.id,title:d.title,type:d.type,created:d.created,encrypted_content:d.encrypted};})
    };
    var fname='trustvault-for-'+target.name.replace(/\s+/g,'_').toLowerCase()+'-'+new Date().toISOString().slice(0,10)+'.json';
    dlStr(JSON.stringify(payload,null,2),fname,'application/json');
    count++;
  });
  // mark docs as sent
  ST.docs.forEach(function(d){if(d.status==='active')d.status='sent';});
  saveST();renderDeathCert();
  toast('Generated '+count+' distribution file(s).','success');
}

// ── ENCRYPTION TOOLS ──
function doEncrypt(){
  var t=document.getElementById('e-plain').value,p=document.getElementById('e-pass').value;
  if(!t||!p)return toast('Fill both fields.','error');
  encryptStr(t,p).then(function(enc){document.getElementById('e-result').textContent=enc;document.getElementById('e-out').style.display='block';toast('Encrypted.','success');}).catch(function(e){toast('Error: '+e.message,'error');});
}
function doDecrypt(){
  var c=document.getElementById('d-cipher').value.trim(),p=document.getElementById('d-pass').value;
  if(!c||!p)return toast('Fill both fields.','error');
  decryptStr(c,p).then(function(txt){document.getElementById('d-result').textContent=txt;document.getElementById('d-out').style.display='block';toast('Decrypted.','success');}).catch(function(){toast('Wrong passphrase or invalid data.','error');});
}

// ── VAULT ──
function exportVault(){dlStr(JSON.stringify(ST,null,2),'trustvault-vault-'+new Date().toISOString().slice(0,10)+'.json','application/json');toast('Vault exported.','success');}
function exportPlain(){
  var d={exported:new Date().toISOString(),profile:ST.profile,docs:ST.docs,bens:ST.bens,recs:ST.recs,witnesses:ST.witnesses};
  dlStr(JSON.stringify(d,null,2),'trustvault-backup-'+new Date().toISOString().slice(0,10)+'.json','application/json');toast('Backup exported.','success');
}
function importVault(){
  var f=document.getElementById('import-file').files[0];if(!f)return toast('Select a file.','error');
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var d=JSON.parse(e.target.result),imp=0;
      if(Array.isArray(d.docs))d.docs.forEach(function(x){if(!ST.docs.find(function(y){return y.id===x.id;})){ST.docs.push(x);imp++;}});
      if(Array.isArray(d.bens))d.bens.forEach(function(x){if(!ST.bens.find(function(y){return y.id===x.id;}))ST.bens.push(x);});
      if(Array.isArray(d.recs||d.recipients))(d.recs||d.recipients).forEach(function(x){if(!ST.recs.find(function(y){return y.id===x.id;}))ST.recs.push(x);});
      if(Array.isArray(d.witnesses))d.witnesses.forEach(function(x){if(!ST.witnesses.find(function(y){return y.id===x.id;}))ST.witnesses.push(x);});
      if(Array.isArray(d.checkins)){d.checkins.forEach(function(c){ST.checkins.push(c);});ST.checkins.sort(function(a,b){return new Date(b.time)-new Date(a.time);});if(ST.checkins.length)ST.lastCheckin=new Date(ST.checkins[0].time);}
      if(d.profile)Object.assign(ST.profile,d.profile);
      saveST();refreshAll();toast('Imported '+imp+' new document(s).','success');
    }catch(err){toast('Failed to parse file: '+err.message,'error');}
  };reader.readAsText(f);
}
function updateVaultStats(){
  var vd=document.getElementById('vs-docs'),vb=document.getElementById('vs-bens'),vr=document.getElementById('vs-recs'),vsz=document.getElementById('vs-size');
  if(vd)vd.textContent=ST.docs.length;
  if(vb)vb.textContent=ST.bens.length;
  if(vr)vr.textContent=ST.recs.length;
  if(vsz){var raw=localStorage.getItem(SKEY)||'';vsz.textContent=(raw.length/1024).toFixed(1)+' KB';}
}

// ── PROFILE ──
function saveProfile(){ST.profile.name=document.getElementById('p-name').value;ST.profile.email=document.getElementById('p-email').value;saveST();toast('Saved.','success');}
function clearAll(){if(!confirm('Delete ALL local data permanently? Export a backup first!'))return;localStorage.removeItem(SKEY);Object.assign(ST,{docs:[],bens:[],recs:[],witnesses:[],guardians:[],checkins:[],lastCheckin:null,deathCert:null});refreshAll();toast('Cleared.','success');}

// ── STATS ──
function updateStats(){
  var sd=document.getElementById('s-docs'),sb=document.getElementById('s-bens'),sw=document.getElementById('s-wits');
  if(sd)sd.textContent=ST.docs.length;
  if(sb)sb.textContent=ST.bens.length;
  if(sw)sw.textContent=ST.witnesses.length;
  var total=ST.bens.reduce(function(s,b){return s+b.pct;},0);
  var sa=document.getElementById('s-alloc');if(sa)sa.textContent=total+'%';
}

function updateDashboardSteps(){
  var hasDoc=ST.docs.length>0;
  var confirmedWit=ST.witnesses.filter(function(w){return w.confirmed;}).length;
  var hasDC=!!ST.deathCert;
  // Step 1
  var ds1=document.getElementById('ds-step1'),ds1t=document.getElementById('ds1-title'),ds1s=document.getElementById('ds1-status');
  if(ds1)ds1.className='ts-box'+(hasDoc?' ts-done':'');
  if(ds1t){ds1t.className='ts-title'+(hasDoc?' done-title':'');ds1t.textContent=hasDoc?'&#10003; Will Signed':'Sign Your Will';}
  if(ds1s)ds1s.textContent=hasDoc?ST.docs.length+' document(s) signed':'No documents yet';
  // Step 2
  var ds2=document.getElementById('ds-step2'),ds2t=document.getElementById('ds2-title'),ds2s=document.getElementById('ds2-status');
  var w2ok=confirmedWit>=2;
  if(ds2)ds2.className='ts-box'+(w2ok?' ts-done':confirmedWit>0?' ts-active':'');
  if(ds2t){ds2t.className='ts-title'+(w2ok?' done-title':'');ds2t.textContent=w2ok?'&#10003; Witnesses Confirmed':'Invite Your Witnesses';}
  if(ds2s)ds2s.textContent=confirmedWit+' / 2 confirmed';
  // Step 3
  var ds3=document.getElementById('ds-step3'),ds3t=document.getElementById('ds3-title'),ds3s=document.getElementById('ds3-status');
  if(ds3)ds3.className='ts-box'+(hasDC?' ts-done':'');
  if(ds3t){ds3t.className='ts-title'+(hasDC?' done-title':'');ds3t.textContent=hasDC?'&#10003; Distribution Triggered':'Automatic Distribution';}
  if(ds3s)ds3s.textContent=hasDC?'Death certificate recorded':'Pending trigger';
  renderBens();
}

// ── TIMERS ──
var _timer=null;
function startTimers(){if(_timer)clearInterval(_timer);_timer=setInterval(function(){tickTimer();refreshCiUI();},1000);tickTimer();}
function tickTimer(){
  ['ciTimer','dashTimer'].forEach(function(id){
    var el=document.getElementById(id);if(!el)return;
    if(!ST.lastCheckin){el.textContent='--:--:--';return;}
    var ms=Date.now()-new Date(ST.lastCheckin).getTime();
    el.textContent=pad(Math.floor(ms/3600000))+':'+pad(Math.floor((ms%3600000)/60000))+':'+pad(Math.floor((ms%60000)/1000));
  });
}
function pad(n){return String(n).padStart(2,'0');}

// ── UTILS ──
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function copyEl(id){var el=document.getElementById(id);if(el)navigator.clipboard.writeText(el.textContent).then(function(){toast('Copied.','success');});}
function dlStr(str,fname,type){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([str],{type:type||'application/octet-stream'}));a.download=fname;a.click();URL.revokeObjectURL(a.href);}

var _tt=null;
function toast(msg,type){var el=document.getElementById('toast');el.textContent=msg;el.className='show '+(type||'success');if(_tt)clearTimeout(_tt);_tt=setTimeout(function(){el.className='';},3200);}

function refreshAll(){
  updateStats();updateDashboardSteps();refreshCiUI();renderCiHistory();renderBens();
  renderWitnesses();renderDeathCert();loadMN();
  var pn=document.getElementById('p-name'),pe=document.getElementById('p-email');
  if(pn)pn.value=ST.profile.name||'';if(pe)pe.value=ST.profile.email||'';
  updateVaultStats();
}

// ── TRUSTLESS EXECUTION — AUDIT LOG ──
function getAuditLog(){
  var entries=[];
  if(ST.docs.length){ST.docs.forEach(function(d){entries.push({time:d.created,msg:'Document signed: "'+d.title+'" ('+d.type+')'});});}
  if(ST.witnesses.length){ST.witnesses.forEach(function(w){if(w.confirmed)entries.push({time:w.confirmedAt,msg:'Witness confirmed: '+w.name+' ('+w.role+')'});});}
  ST.checkins.slice(0,5).forEach(function(c){entries.push({time:new Date(c.time).toISOString(),msg:'Check-in recorded: '+c.note});});
  if(ST.deathCert)entries.push({time:ST.deathCert.uploadedAt,msg:'Death certificate recorded by '+ST.deathCert.executor+' (DOD: '+ST.deathCert.dateOfDeath+')'});
  ST.guardians.forEach(function(g){if(g.voted)entries.push({time:g.votedAt,msg:'Guardian voted: '+g.name});});
  entries.sort(function(a,b){return new Date(b.time)-new Date(a.time);});
  return entries;
}
function renderAuditLog(){
  var el=document.getElementById('te-audit-log');if(!el)return;
  var entries=getAuditLog();
  if(!entries.length){el.innerHTML='<div class="al-row"><span class="al-time">No events yet</span><span class="al-msg">Audit entries appear as actions are taken</span></div>';return;}
  el.innerHTML=entries.map(function(e){return '<div class="al-row"><span class="al-time">'+new Date(e.time).toLocaleString()+'</span><span class="al-msg">'+esc(e.msg)+'</span></div>';}).join('');
}
function exportAuditLog(){
  var entries=getAuditLog();
  var text='TRUSTVAULT AUDIT LOG\nGenerated: '+new Date().toISOString()+'\n\n'+entries.map(function(e){return new Date(e.time).toLocaleString()+'\t'+e.msg;}).join('\n');
  dlStr(text,'trustvault-audit-'+new Date().toISOString().slice(0,10)+'.txt','text/plain');
  toast('Audit log exported.','success');
}

// ── GUARDIAN NETWORK — M-of-N ──
var MN={ m: 2, n: 3 };
function loadMN(){var s=localStorage.getItem('tv_mn');if(s){try{Object.assign(MN,JSON.parse(s));}catch(e){}}updateMNDisplay();}
function saveMN(){if(MN.m>MN.n){toast('M cannot exceed N.','error');return;}localStorage.setItem('tv_mn',JSON.stringify(MN));updateMNDisplay();toast('Voting threshold saved: '+MN.m+' of '+MN.n,'success');}
function adjMN(which,delta){
  if(which==='m'){MN.m=Math.max(1,Math.min(MN.n,MN.m+delta));}
  else{MN.n=Math.max(MN.m,Math.min(10,MN.n+delta));}
  updateMNDisplay();
}
function updateMNDisplay(){
  var mm=document.getElementById('mn-m'),mn=document.getElementById('mn-n'),ms=document.getElementById('mn-summary');
  if(mm)mm.textContent=MN.m;if(mn)mn.textContent=MN.n;
  if(ms)ms.textContent='Requiring '+MN.m+' of '+MN.n+' guardian votes to confirm distribution.';
  var gnl=document.getElementById('gn-guardian-list');
  if(gnl){
    if(!ST.guardians.length){gnl.innerHTML='<p class="txt-muted" style="font-size:13px">No guardians added yet. Go to <span class="txt-blue" data-on-click="nav(\'deathcert\')">Death Certificate</span> to add guardians.</p>';}
    else{
      var voted=ST.guardians.filter(function(g){return g.voted;}).length;
      gnl.innerHTML='<div class="alert '+(voted>=MN.m?'alert-ok':'alert-info')+'" style="margin-bottom:12px">'+voted+' / '+MN.m+' required votes received ('+ST.guardians.length+' total guardians)</div>'+
      ST.guardians.map(function(g){
        return '<div class="person-card"><div class="person-info"><div class="person-av'+(g.voted?' ok':'')+'">'+g.name[0].toUpperCase()+'</div>'+
        '<div><div class="person-name">'+esc(g.name)+'</div><div class="person-meta">'+(g.voted?'&#10003; Voted '+new Date(g.votedAt).toLocaleDateString():'Pending vote')+'</div></div></div>'+
        (g.voted?'<span class="badge badge-confirmed">Voted</span>':'<span class="badge badge-pending">Pending</span>')+'</div>';
      }).join('');
    }
  }
}

// ── DEATH VERIFICATION — 3 LAYERS + CHALLENGE PERIOD ──
var CHALLENGE_DAYS=7;
function loadChallenge(){var s=localStorage.getItem('tv_challenge');if(s)CHALLENGE_DAYS=parseInt(s)||7;}
function saveChallengePeriod(){CHALLENGE_DAYS=parseInt(document.getElementById('v-challenge-days').value);localStorage.setItem('tv_challenge',CHALLENGE_DAYS);toast('Challenge period set to '+CHALLENGE_DAYS+' days.','success');}

function renderVerification(){
  loadChallenge();
  var cd=document.getElementById('v-challenge-days');if(cd)cd.value=CHALLENGE_DAYS;

  // Layer statuses
  var voted=ST.guardians.filter(function(g){return g.voted;}).length;
  var hasCert=!!ST.deathCert;
  var guardiansOK=ST.guardians.length===0||voted>=MN.m;

  var vl1=document.getElementById('vl1'),vl2=document.getElementById('vl2'),vl3=document.getElementById('vl3');
  if(vl1)vl1.className='vl-row'+(guardiansOK?' done':ST.deathCert?' active':'');
  if(vl2)vl2.className='vl-row'+(hasCert?' done':guardiansOK?' active':'');
  if(vl3)vl3.className='vl-row'+(hasCert&&guardiansOK?' active':'');

  var vs1=document.getElementById('v-s1'),vs2=document.getElementById('v-s2'),vs3=document.getElementById('v-s3');
  if(vs1)vs1.innerHTML=guardiansOK?'<span class="txt-ok">&#10003; Met</span>':voted+' / '+Math.max(MN.m,1)+' votes';
  if(vs2)vs2.innerHTML=hasCert?'<span class="txt-ok">&#10003; Verified</span>':'Not Uploaded';

  // Challenge period
  var cp=document.getElementById('v-challenge-panel'),ct=document.getElementById('v-challenge-timer');
  if(hasCert&&guardiansOK&&CHALLENGE_DAYS>0){
    var certTime=new Date(ST.deathCert.uploadedAt);
    var deadline=new Date(certTime.getTime()+CHALLENGE_DAYS*86400000);
    var now=new Date();
    var remaining=(deadline-now)/86400000;
    if(remaining>0){
      cp.className='challenge-panel active-challenge';
      if(ct)ct.textContent=remaining.toFixed(1)+' days remaining';
      cp.querySelector('.challenge-desc').textContent='Distribution is locked during the challenge period. If this trigger was made in error, this is the window to contest it.';
      if(vs3)vs3.innerHTML='<span style="color:var(--warn)">'+remaining.toFixed(1)+'d left</span>';
    } else {
      cp.className='challenge-panel';cp.style.background='var(--ok2)';cp.style.borderColor='#bbf7d0';
      cp.querySelector('.challenge-title').style.color='var(--ok)';
      if(ct)ct.textContent='Period Elapsed';
      cp.querySelector('.challenge-desc').textContent='Challenge period has passed. Distribution is authorized.';
      if(vs3)vs3.innerHTML='<span class="txt-ok">&#10003; Elapsed</span>';
    }
  } else if(CHALLENGE_DAYS===0){
    cp.className='challenge-panel inactive';if(ct)ct.textContent='Disabled';
    if(vs3)vs3.innerHTML=hasCert&&guardiansOK?'<span class="txt-ok">&#10003; None</span>':'Pending';
  } else {
    cp.className='challenge-panel inactive';if(ct)ct.textContent='Not Active';
    if(vs3)vs3.textContent='Pending';
  }
}

// ── INIT ──
window.addEventListener('load',function(){
  var ex=localStorage.getItem(SKEY);
  if(ex){try{var d=JSON.parse(ex);var cnt=(d.docs||[]).length;
    if(cnt>0){var b=document.createElement('div');
    b.style.cssText='position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#1e3a5f;color:#fff;padding:11px 20px;border-radius:9px;font-size:13px;font-weight:500;z-index:999;box-shadow:0 4px 20px rgba(0,0,0,.3);display:flex;align-items:center;gap:11px;max-width:90vw';
    b.innerHTML='&#128190; Found vault ('+cnt+' doc'+(cnt!==1?'s':'')+') <button data-on-click="enterApp();this.parentNode.remove()" style="background:#2d6a9f;border:none;color:#fff;padding:5px 13px;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600">Open</button> <button data-on-click="this.parentNode.remove()" style="background:transparent;border:1px solid rgba(255,255,255,.3);color:rgba(255,255,255,.6);padding:5px 11px;border-radius:5px;cursor:pointer;font-size:12px">Dismiss</button>';
    document.body.appendChild(b);}
  }catch(e){}}
});



// ─────────────────────────────────────────────────────────────
// ADDON: New features for TrustVault Unified v4
// ─────────────────────────────────────────────────────────────

// ── SIDEBAR ──────────────────────────────────────────────────
function toggleSidebar() {
  var s = document.getElementById('sidebar');
  var o = document.getElementById('sidebar-overlay');
  if(s) s.classList.toggle('open');
  if(o) o.classList.toggle('open');
}
function closeSidebar() {
  var s = document.getElementById('sidebar');
  var o = document.getElementById('sidebar-overlay');
  if(s) s.classList.remove('open');
  if(o) o.classList.remove('open');
}

// ── WILL FORM CLEAR ───────────────────────────────────────────
function clearWillForm() {
  ['c-title','c-pass','c-pass2'].forEach(function(id) {
    var e = document.getElementById(id); if(e) e.value = '';
  });
  var c = document.getElementById('c-content'); if(c) c.value = '';
  window._editingDocId = null;
  toast('Form cleared.', 'success');
}

// ── ENCRYPT CLEAR BUTTONS ────────────────────────────────────
function clearEncryptFields() {
  var e = document.getElementById('e-plain');   if(e) e.value = '';
  var p = document.getElementById('e-pass');    if(p) p.value = '';
  var o = document.getElementById('e-out');     if(o) o.style.display = 'none';
  var r = document.getElementById('e-result');  if(r) r.textContent = '';
  toast('Encrypt fields cleared.', 'success');
}
function clearDecryptFields() {
  var e = document.getElementById('d-cipher');  if(e) e.value = '';
  var p = document.getElementById('d-pass');    if(p) p.value = '';
  var o = document.getElementById('d-out');     if(o) o.style.display = 'none';
  var r = document.getElementById('d-result');  if(r) r.textContent = '';
  toast('Decrypt fields cleared.', 'success');
}

// ── EDIT DOCUMENT (passphrase-gated) ─────────────────────────
function editDoc(id) {
  var d = ST.docs.find(function(x) { return x.id === id; });
  if(!d) { toast('Document not found.', 'error'); return; }
  var pass = prompt('Enter the decryption passphrase to edit this document:');
  if(!pass) return;
  decryptStr(d.encrypted || d.encrypted_content || '', pass).then(function(txt) {
    var t = document.getElementById('c-title');  if(t) t.value = d.title || '';
    var ty = document.getElementById('c-type');  if(ty) ty.value = d.type || d.document_type || 'will';
    var dl = document.getElementById('c-delay'); if(dl) dl.value = d.delay || d.delay_days || 90;
    var cn = document.getElementById('c-content'); if(cn) cn.value = txt;
    var p1 = document.getElementById('c-pass');  if(p1) p1.value = '';
    var p2 = document.getElementById('c-pass2'); if(p2) p2.value = '';
    window._editingDocId = id;
    nav('will');
    toast('Document decrypted. Edit and re-encrypt to save changes.', 'success');
  }).catch(function() {
    toast('Wrong passphrase or corrupted document.', 'error');
  });
}

// ── BENEFICIARY PASSWORD — SECURE MODAL ──────────────────────
/* ===== ulyOS hardening: PBKDF2-HMAC-SHA256 (pure JS, synchronous, 120,000 iterations) =====
   Replaces the old unsalted / 32-bit djb2 hashes used for the beneficiary password and the vault passcode.
   Old hashes still verify once and are upgraded to this format automatically. */
var _K256 = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
var _IV256 = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
function _sha256Compress(H, w) {
  for (var i = 16; i < 64; i++) { var a = w[i-15], b = w[i-2]; var s0 = ((a>>>7)|(a<<25))^((a>>>18)|(a<<14))^(a>>>3); var s1 = ((b>>>17)|(b<<15))^((b>>>19)|(b<<13))^(b>>>10); w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0; }
  var A=H[0],B=H[1],C=H[2],D=H[3],E=H[4],F=H[5],G=H[6],Hh=H[7];
  for (i = 0; i < 64; i++) { var S1=((E>>>6)|(E<<26))^((E>>>11)|(E<<21))^((E>>>25)|(E<<7)); var ch=(E&F)^(~E&G); var t1=(Hh+S1+ch+_K256[i]+w[i])|0; var S0=((A>>>2)|(A<<30))^((A>>>13)|(A<<19))^((A>>>22)|(A<<10)); var mj=(A&B)^(A&C)^(B&C); var t2=(S0+mj)|0; Hh=G;G=F;F=E;E=(D+t1)|0;D=C;C=B;B=A;A=(t1+t2)|0; }
  H[0]=(H[0]+A)|0;H[1]=(H[1]+B)|0;H[2]=(H[2]+C)|0;H[3]=(H[3]+D)|0;H[4]=(H[4]+E)|0;H[5]=(H[5]+F)|0;H[6]=(H[6]+G)|0;H[7]=(H[7]+Hh)|0;
}
function _sha256Cont(bytes, state, prefixLen) {   /* hash `bytes`, continuing from `state` that already consumed prefixLen bytes */
  var H = (state || _IV256).slice(), len = bytes.length, pad = ((len + 9 + 63) >> 6) << 6, buf = new Uint8Array(pad);
  buf.set(bytes); buf[len] = 0x80;
  var bits = ((prefixLen || 0) + len) * 8, dv = new DataView(buf.buffer);
  dv.setUint32(pad - 8, Math.floor(bits / 4294967296)); dv.setUint32(pad - 4, bits >>> 0);
  var w = new Uint32Array(64);
  for (var o = 0; o < pad; o += 64) { for (var i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4); _sha256Compress(H, w); }
  return H;
}
function _h2b(H) { var o = new Uint8Array(32), dv = new DataView(o.buffer); for (var i = 0; i < 8; i++) dv.setUint32(i * 4, H[i] >>> 0); return o; }
function _pbkdf2Hex(pass, salt, iter) {
  var enc = new TextEncoder(), key = enc.encode(String(pass));
  if (key.length > 64) key = _h2b(_sha256Cont(key));
  var ip = new Uint8Array(64), op = new Uint8Array(64);
  for (var i = 0; i < 64; i++) { var kb = i < key.length ? key[i] : 0; ip[i] = kb ^ 0x36; op[i] = kb ^ 0x5c; }
  var w = new Uint32Array(64), dv;
  function absorb(block) { var H = _IV256.slice(); dv = new DataView(block.buffer); for (var j = 0; j < 16; j++) w[j] = dv.getUint32(j * 4); _sha256Compress(H, w); return H; }
  var iSt = absorb(ip), oSt = absorb(op);
  var sb = enc.encode(String(salt)), m = new Uint8Array(sb.length + 4); m.set(sb); m[m.length - 1] = 1;
  var U = _sha256Cont(_h2b(_sha256Cont(m, iSt, 64)), oSt, 64), T = U.slice();
  for (var n = 1; n < iter; n++) {
    var H = iSt.slice(); for (i = 0; i < 8; i++) w[i] = U[i]; w[8] = 0x80000000; for (i = 9; i < 15; i++) w[i] = 0; w[15] = 768; _sha256Compress(H, w);
    var H2 = oSt.slice(); for (i = 0; i < 8; i++) w[i] = H[i]; w[8] = 0x80000000; for (i = 9; i < 15; i++) w[i] = 0; w[15] = 768; _sha256Compress(H2, w);
    U = H2; for (i = 0; i < 8; i++) T[i] ^= U[i];
  }
  var hex = ''; for (i = 0; i < 8; i++) hex += ('00000000' + (T[i] >>> 0).toString(16)).slice(-8);
  return hex;
}
function _rndHex(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); var s = ''; for (var i = 0; i < n; i++) s += ('0' + a[i].toString(16)).slice(-2); return s; }
function _ctEq(a, b) { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
var _KDF_ITER = 120000;

var _BPK = 'tv_bp_v4';
var _benPassCb = null;
var _benPassMode = 'check';

function _bpHashLegacy(p) {   /* OLD 32-bit hash — only used to recognise and upgrade existing installs */
  var h = 5381;
  for(var i = 0; i < p.length; i++) { h = ((h << 5) + h) + p.charCodeAt(i); }
  return (h >>> 0).toString(16);
}
function _bpMake(p) { var salt = _rndHex(16); return 'pbkdf2$' + _KDF_ITER + '$' + salt + '$' + _pbkdf2Hex(p, salt, _KDF_ITER); }
function _bpVerify(p, stored) {
  if (stored && stored.indexOf('pbkdf2$') === 0) {
    var parts = stored.split('$'), it = parseInt(parts[1], 10);
    if (!(it >= 10000 && it <= 1000000)) return false;
    return _ctEq(_pbkdf2Hex(p, parts[2], it), parts[3]);
  }
  if (stored && _ctEq(_bpHashLegacy(p), stored)) { localStorage.setItem(_BPK, _bpMake(p)); return true; }   /* upgrade old hash */
  return false;
}

function _openBenPassModal(title, sub, mode, callback) {
  _benPassCb = callback;
  _benPassMode = mode;
  var el;
  el = document.getElementById('mbp-title'); if(el) el.textContent = title;
  el = document.getElementById('mbp-sub');   if(el) el.textContent = sub;
  el = document.getElementById('mbp-lbl1');  if(el) el.textContent = (mode === 'set') ? 'New Password' : 'Password';
  el = document.getElementById('mbp-confirm-wrap');
  if(el) el.style.display = (mode === 'set') ? 'block' : 'none';
  el = document.getElementById('mbp-p1');  if(el) el.value = '';
  el = document.getElementById('mbp-p2');  if(el) el.value = '';
  el = document.getElementById('mbp-err'); if(el) el.textContent = '';
  openM('m-benpass');
  setTimeout(function() {
    var f = document.getElementById('mbp-p1'); if(f) f.focus();
  }, 120);
}

function _benPassSubmit() {
  var p1 = document.getElementById('mbp-p1').value;
  var p2 = document.getElementById('mbp-p2') ? document.getElementById('mbp-p2').value : '';
  var err = document.getElementById('mbp-err');
  if(!p1) { if(err) err.textContent = 'Password cannot be empty.'; return; }
  if(_benPassMode === 'set') {
    if(p1.length < 4) { if(err) err.textContent = 'Password must be at least 4 characters.'; return; }
    if(p1 !== p2) { if(err) err.textContent = 'Passwords do not match.'; var p2el = document.getElementById('mbp-p2'); if(p2el){p2el.value='';p2el.focus();} return; }
    localStorage.setItem(_BPK, _bpMake(p1));
    closeM('m-benpass');
    setupBenAlert();
    if(_benPassCb) _benPassCb(true);
  } else {
    var stored = localStorage.getItem(_BPK) || '';
    if(!_bpVerify(p1, stored)) {
      if(err) err.textContent = 'Incorrect password. Try again.';
      var p1el = document.getElementById('mbp-p1'); if(p1el){p1el.value='';p1el.focus();}
      return;
    }
    closeM('m-benpass');
    if(_benPassCb) _benPassCb(true);
  }
}

function _benPassCancel() {
  closeM('m-benpass');
  if(_benPassCb) _benPassCb(false);
}

function _benPassOk(action, callback) {
  var stored = localStorage.getItem(_BPK) || '';
  if(!stored) {
    _openBenPassModal(
      'Set Beneficiary Password',
      'Create a password to protect your beneficiaries from accidental changes.',
      'set', callback
    );
  } else {
    _openBenPassModal(
      '🔒 Password Required',
      'Enter your beneficiary password to ' + action + '.',
      'check', callback
    );
  }
}

// Enter key support for password modal
document.addEventListener('keydown', function(e) {
  if(e.key === 'Enter') {
    var modal = document.getElementById('m-benpass');
    if(modal && modal.classList.contains('open')) _benPassSubmit();
  }
});

// ── delBen — replaces the core version ───────────────────────
function delBen(id) {
  _benPassOk('delete this beneficiary', function(ok) {
    if(!ok) return;
    if(!confirm('Permanently delete this beneficiary? This cannot be undone.')) return;
    ST.bens = ST.bens.filter(function(b) { return b.id !== id; });
    saveST(); renderBens(); updateStats(); updateDashboardSteps();
    toast('Beneficiary removed.', 'success');
  });
}

// ── BEN EDIT MODAL ───────────────────────────────────────────
function openBenEdit(id) {
  var b = ST.bens.find(function(x) { return x.id === id; });
  if(!b) return;
  _benPassOk('edit this beneficiary', function(ok) {
    if(!ok) return;
    var el;
    el = document.getElementById('mbe-id');    if(el) el.value = id;
    el = document.getElementById('mbe-name');  if(el) el.value = b.name || '';
    el = document.getElementById('mbe-rel');   if(el) el.value = b.rel || 'Spouse / Partner';
    el = document.getElementById('mbe-pct');   if(el) el.value = b.pct || '';
    el = document.getElementById('mbe-email'); if(el) el.value = b.email || '';
    el = document.getElementById('mbe-notes'); if(el) el.value = b.notes || '';
    el = document.getElementById('mbe-err');   if(el) el.textContent = '';
    openM('m-ben-edit');
  });
}

function saveBenEdit() {
  var id    = document.getElementById('mbe-id').value;
  var name  = (document.getElementById('mbe-name').value || '').trim();
  var rel   = document.getElementById('mbe-rel').value;
  var pct   = parseInt(document.getElementById('mbe-pct').value) || 0;
  var email = (document.getElementById('mbe-email').value || '').trim();
  var notes = (document.getElementById('mbe-notes').value || '').trim();
  var err   = document.getElementById('mbe-err');
  if(!name) { if(err) err.textContent = 'Full name is required.'; return; }
  if(pct < 1 || pct > 100) { if(err) err.textContent = 'Allocation must be 1-100%.'; return; }
  var b = ST.bens.find(function(x) { return x.id === id; });
  if(!b) { if(err) err.textContent = 'Beneficiary not found.'; return; }
  b.name = name; b.rel = rel; b.pct = pct; b.email = email; b.notes = notes;
  saveST(); renderBens(); updateStats(); updateDashboardSteps();
  closeM('m-ben-edit');
  toast('Beneficiary updated.', 'success');
}

function setBenPassword() {
  var stored = localStorage.getItem(_BPK) || '';
  if(stored) {
    _benPassOk('change your password', function(ok) {
      if(!ok) return;
      _openBenPassModal('Set New Password', 'Choose a new beneficiary protection password (min 4 chars).', 'set', function(ok2) {
        if(ok2) toast('Beneficiary password updated.', 'success');
      });
    });
  } else {
    _openBenPassModal('Set Beneficiary Password', 'Create a password to protect beneficiary data.', 'set', function(ok) {
      if(ok) toast('Beneficiary password set.', 'success');
    });
  }
}

function resetBenPass() {
  if(!confirm('Reset beneficiary password? You will be prompted to create a new one on the next edit or delete.')) return;
  localStorage.removeItem(_BPK);
  setupBenAlert();
  toast('Beneficiary password reset.', 'success');
}

function setupBenAlert() {
  var el = document.getElementById('ben-setup-alert');
  if(!el) return;
  if(!localStorage.getItem(_BPK)) {
    el.innerHTML = '<div class="alert alert-info">&#128274; No beneficiary password set yet. You will be prompted to create one on your first edit or delete. <span class="txt-blue" style="cursor:pointer" data-on-click="setBenPassword()">Set it now.</span></div>';
  } else {
    el.innerHTML = '';
  }
}

// ── ENCRYPTED EXPORT / IMPORT ────────────────────────────────
function exportEncryptedVault() {
  var pass = prompt('Enter a password to encrypt the backup file (min 6 characters):');
  if(!pass || pass.length < 6) { toast('Password must be at least 6 characters.', 'error'); return; }
  var pass2 = prompt('Confirm password:');
  if(pass !== pass2) { toast('Passwords do not match.', 'error'); return; }
  var data = JSON.stringify({ vault: ST, cec: { checks: ceChecks }, exported: new Date().toISOString(), v: 'tv4' });
  encryptStr(data, pass).then(function(enc) {
    dlStr(
      JSON.stringify({ enc: enc, hint: 'TrustVault Encrypted Export v4' }),
      'trustvault-encrypted-' + new Date().toISOString().slice(0, 10) + '.tvault',
      'application/json'
    );
    toast('Encrypted backup saved.', 'success');
  }).catch(function(e) { toast('Encryption failed: ' + e.message, 'error'); });
}

function importEncryptedVault() {
  var fi = document.getElementById('import-enc-file');
  if(!fi || !fi.files || !fi.files[0]) { toast('Select a file first.', 'error'); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var obj = JSON.parse(e.target.result);
      if(!obj.enc) { toast('Not a valid encrypted vault file.', 'error'); return; }
      var pass = prompt('Enter the password to decrypt this file:');
      if(!pass) return;
      decryptStr(obj.enc, pass).then(function(txt) {
        var data = JSON.parse(txt);
        if(data.vault) Object.assign(ST, data.vault);
        if(data.cec && data.cec.checks) ceChecks = data.cec.checks;
        saveST(); saveCEC(); refreshAll(); cecRenderChecks(); cecUpdateScores();
        toast('Encrypted vault imported successfully.', 'success');
      }).catch(function() { toast('Wrong password or corrupted file.', 'error'); });
    } catch(e) { toast('Invalid file format.', 'error'); }
  };
  reader.readAsText(fi.files[0]);
}

// ── CEC STATE ────────────────────────────────────────────────
var SKEY_CEC = 'tv_cec_v4';
var ceChecks = {};

var MY_TOKENS=[
{tok:'XRP',name:'Ripple',net:'XRP Ledger (XRPL)',wallet:'XUMM/Xaman',note:'10 XRP base reserve cannot be withdrawn. SOLO tokens may share this account as trust lines. Public address starts with r...'},
{tok:'XLM',name:'Stellar Lumens',net:'Stellar Network',wallet:'LOBSTR / Ledger',note:'1 XLM base reserve per account. Check for any Stellar-based tokens in the same account.'},
{tok:'HBAR',name:'Hedera',net:'Hedera Hashgraph',wallet:'HashPack / Ledger',note:'Account ID format is 0.0.XXXXXX. Check for unclaimed staking rewards on hashscan.io before transferring.'},
{tok:'XDC',name:'XinFin / XDC',net:'XDC Network',wallet:'XDCPay / Exchange',note:'EVM-compatible chain. Wallet address starts with xdc... (same private key as 0x Ethereum address). Check for XRC-20 tokens.'},
{tok:'FLR',name:'Flare Network',net:'Flare Network',wallet:'Bifrost / MetaMask',note:'Check for unclaimed FlareDrops on app.flare.network. FLR and WFLR are different — check for both. EVM-compatible.'},
{tok:'ZBCN',name:'Zebec Network',net:'Solana',wallet:'Phantom / Solflare',note:'Solana-based token. Access via Phantom or Solflare wallet, or exchange. Check for streaming payment contracts.'},
{tok:'SOLO',name:'Sologenic',net:'XRP Ledger (DEX)',wallet:'XUMM / Sologenic DEX',note:'Held as XRPL trust line in the same account as XRP. Access via XUMM. Check Sologenic DEX for any open orders.'},
{tok:'XCM',name:'CoinMetro',net:'CoinMetro Exchange',wallet:'CoinMetro.com',note:'Platform-specific token on CoinMetro exchange. Contact CoinMetro estate team for bereavement process.'},
{tok:'VELO',name:'Velo Protocol',net:'Stellar / BNB Chain',wallet:'Exchange / Wallet',note:'May be on Stellar network or BNB Chain — check both. Verify which network your holdings are on.'},
{tok:'ONDO',name:'Ondo Finance',net:'Ethereum (ERC-20)',wallet:'MetaMask / Exchange',note:'ERC-20 token on Ethereum. Tokenized real-world assets — check for any staking or yield positions.'},
{tok:'AXL',name:'Axelar',net:'Axelar Network',wallet:'Keplr / Exchange',note:'Cross-chain interoperability token. Access via Keplr wallet or exchange. Check for any delegated staking.'},
{tok:'SGB',name:'Songbird',net:'Songbird Network',wallet:'Bifrost / MetaMask',note:'Sister network to Flare. Check for SGB delegation rewards on app.songbird.network before transferring.'},
{tok:'CSPR',name:'Casper Network',net:'Casper Network',wallet:'Casper Wallet / Exch.',note:'Check for any staking delegations on cspr.live. Undelegating takes approximately 14 hours.'},
];
var CHECKS={
s1g1:[
{id:'s1_roster',lbl:'Every token I own is listed in the crypto roster above',desc:'Including any small or forgotten holdings. Even dust balances should be noted.',why:'An overlooked wallet is a tragedy for your family.',tags:["CRITICAL"]},
{id:'s1_addresses',lbl:'Public wallet addresses are documented for each holding',desc:'Public addresses are safe to write down — they let your family verify balances on a block explorer without needing your private key.',tags:["CRYPTO"]},
{id:'s1_values',lbl:'Approximate USD value is noted for each holding',desc:'Update at least every 6 months so your family understands the scale of what they are dealing with.',tags:[]},
{id:'s1_defi',lbl:'Any DeFi positions, NFTs, or staking rewards are documented',desc:'DeFi positions can expire or be lost if not claimed or exited promptly after death.',tags:["SECURITY"]},
],
s1g2:[
{id:'s1_exchanges',lbl:'All exchange accounts are listed with their login email addresses',desc:'Include even dormant or small-balance accounts. Check each exchange if unsure what accounts exist.',tags:["CRITICAL"]},
{id:'s1_hw_loc',lbl:'Physical location of every hardware wallet device is documented',desc:'Your Ledger or other hardware wallets must be physically findable. Note the exact location.',tags:["CRITICAL"]},
{id:'s1_sw_wallet',lbl:'All software and mobile wallet apps are documented with which device they are on',desc:'XUMM on iPhone, HashPack on iPad, etc. Note the device and that the device PIN is also needed.',tags:[]},
{id:'s1_staking',lbl:'Any staking, delegation, or DeFi positions are noted with unlock periods',desc:'FLR/SGB delegations, HBAR staking, CSPR delegations all have lock-up or waiting periods.',tags:["SECURITY"]},
],
s1g3:[
{id:'s1_cost_basis',lbl:'Purchase history and cost basis records are saved and accessible',desc:'Original purchase prices are needed for tax calculations. Export transaction history from each exchange.',tags:["LEGAL"]},
{id:'s1_tax_sw',lbl:'Crypto tax tracking software or records are noted (Koinly, CoinTracker, etc.)',desc:'If you use crypto tax software, document where the account is and how to access it.',tags:["LEGAL"]},
{id:'s1_stepped',lbl:'Family is aware of the stepped-up cost basis rule at date of death',desc:'Heirs should get a professional valuation on the date of death. This becomes the new cost basis — pre-death gains are not taxed.',tags:["LEGAL"]},
],
s1g4:[
{id:'s1_schedule',lbl:'A review schedule is set — minimum every 6 months',desc:'New tokens, new wallets, closed accounts — the inventory must stay current or it is useless.',tags:["UPDATE"]},
{id:'s1_trustvault',lbl:'This checklist is saved in TrustVault (encrypted)',desc:'The completed checklist with wallet locations should be encrypted in TrustVault for automatic delivery.',tags:["SECURITY"]},
{id:'s1_executor',lbl:'[Your Executor Name] knows this checklist exists and where to find it',desc:'The best prepared checklist in the world does nothing if your family does not know it exists.',tags:["CRITICAL"]},
],
s2g1:[
{id:'s2_will_names',lbl:'My Will specifically names cryptocurrency as part of my estate',desc:'Do not rely on a catch-all "all my property" clause. Crypto should be specifically mentioned by name.',tags:["CRITICAL","LEGAL"]},
{id:'s2_will_auth',lbl:'My Will gives my executor explicit authority to access digital accounts',desc:'Include language authorizing the executor to access, manage, and transfer all digital assets including cryptocurrency.',tags:["CRITICAL","LEGAL"]},
{id:'s2_trust_ref',lbl:'My Living Trust references digital assets and crypto specifically',desc:'Note in your trust that digital assets should be treated as trust property even if they cannot be formally titled.',tags:["LEGAL"]},
{id:'s2_will_date',lbl:'My Will has been reviewed by an attorney within the last 3 years',desc:'Laws around digital assets are evolving rapidly. An outdated will may not adequately protect your crypto.',tags:["UPDATE"]},
],
s2g2:[
{id:'s2_exec_brief',lbl:'My executor [Your Executor Name] has been personally briefed on my crypto holdings',desc:'She should know you own crypto, roughly how much, and that TrustVault contains the details.',tags:["CRITICAL"]},
{id:'s2_exec_auth',lbl:'Estate documents explicitly authorize computer and account access',desc:'Without explicit authorization, logging into exchange accounts may violate computer fraud laws even to recover assets.',tags:["LEGAL"]},
{id:'s2_exec_able',lbl:'My chosen executor is capable of handling crypto or knows to get help',desc:'Consider a co-executor or digital asset advisor if [Your Executor Name] is not comfortable with crypto.',tags:[]},
],
s2g3:[
{id:'s2_dpoa',lbl:'A Durable Power of Attorney (DPOA) exists naming [Your Executor Name] as agent',desc:'The DPOA covers incapacity — if you have a stroke or accident, [Your Executor Name] can manage your crypto without court intervention.',tags:["CRITICAL"]},
{id:'s2_dpoa_digit',lbl:'My DPOA specifically includes authority over digital assets and crypto',desc:'Many older DPOAs predate crypto. If yours does not mention digital assets, ask your attorney to add a rider or update it.',tags:["LEGAL"]},
{id:'s2_dpoa_sign',lbl:'DPOA is properly signed, witnessed, and notarized',desc:'An unsigned or improperly executed DPOA is useless. Verify with your attorney that it meets your state requirements.',tags:["LEGAL"]},
],
s2g4:[
{id:'s2_bene_check',lbl:'I have checked each exchange for beneficiary or TOD designation options',desc:'Coinbase, Kraken, and others are adding these features. Log in to each account and check settings.',tags:["UPDATE"]},
{id:'s2_bene_named',lbl:'Where available, beneficiary designations are completed and on file',desc:'Named beneficiaries bypass probate entirely — the fastest and cleanest transfer method available.',tags:["CRYPTO"]},
],
s2g5:[
{id:'s2_atty_knows',lbl:'My estate attorney knows I hold cryptocurrency',desc:'Many people never tell their attorney about their crypto. Your attorney cannot protect what they do not know about.',tags:["CRITICAL"]},
{id:'s2_atty_spec',lbl:'My attorney has experience with digital asset estate planning',desc:'This is now a specialized area. If your attorney is unfamiliar, ask them to consult with a digital asset specialist.',tags:["LEGAL"]},
{id:'s2_memo',lbl:'A separate confidential Crypto Memorandum exists and is referenced in my Will',desc:'Best practice: a separate confidential document describing your crypto assets, referenced but not attached to your Will. This keeps sensitive details out of public probate records.',tags:["SECURITY","LEGAL"]},
],
s3g1:[
{id:'s3_metal_bak',lbl:'Every seed phrase is backed up on metal, not just paper',desc:'Paper degrades, burns, and gets wet. Metal seed phrase backups survive house fires and floods.',tags:["CRITICAL","SECURITY"]},
{id:'s3_two_locs',lbl:'Seed phrase backups are stored in at least two separate physical locations',desc:'Home safe plus safety deposit box, or home safe plus your attorney envelope. If one location is destroyed, the backup survives.',tags:["SECURITY"]},
{id:'s3_never_digi',lbl:'No seed phrase has ever been stored digitally — no photos, cloud, or email',desc:'If any seed phrase was ever photographed or emailed, consider that wallet compromised and rotate to a new wallet.',tags:["CRITICAL","SECURITY"]},
{id:'s3_pins_sep',lbl:'Hardware wallet device PINs are documented separately from the seed phrase',desc:'The PIN and seed phrase must never be stored together. If someone finds both in the same place, they have everything.',tags:["SECURITY"]},
{id:'s3_executor_loc',lbl:'[Your Executor Name] knows the physical location of seed phrase backups — not the words, just where to look',desc:'She does not need the actual words now. She needs to know which safe, which box, which envelope to open when the time comes.',tags:["CRITICAL"]},
],
s3g2:[
{id:'s3_exch_proc',lbl:'I have looked up each exchange estate and bereavement process',desc:'Search each exchange name plus "estate claim" or "deceased account". Document the process and any forms required.',tags:["UPDATE"]},
{id:'s3_2fa_codes',lbl:'2FA backup codes for each exchange are stored with estate documents',desc:'If [Your Executor Name] cannot get past 2FA, the estate claim process is the fallback. Having backup codes is faster.',tags:["SECURITY"]},
{id:'s3_creds_tv',lbl:'Exchange login credentials are in TrustVault Passwords and Access document',desc:'Encrypted in TrustVault, delivered to your executor automatically after trigger conditions are met.',tags:["SECURITY"]},
],
s3g3:[
{id:'s3_hw_steps',lbl:'Step-by-step hardware wallet recovery instructions are written out',desc:'In plain, non-technical language. "Download Ledger Live from ledger.com/ledger-live" is better than "install the wallet software."',tags:["CRITICAL"]},
{id:'s3_hw_findable',lbl:'The hardware wallet device is in a known, accessible location',desc:'[Your Executor Name] must be able to physically find the device. Note the exact location and any combination or key needed.',tags:[]},
{id:'s3_ll_guide',lbl:'Ledger Live download and setup instructions are provided with the official URL',desc:'Include ledger.com/ledger-live, what to look for, and a warning about fake phishing sites that look identical.',tags:["SECURITY"]},
],
s3g4:[
{id:'s3_helper_id',lbl:'A trusted crypto-knowledgeable helper is identified and has agreed to help',desc:'They should know they are named, understand their role as a guide only, and have no financial stake in the estate.',tags:["CRITICAL"]},
{id:'s3_helper_ct',lbl:'Helper contact information is stored in TrustVault and in this checklist',desc:'[Your Executor Name] should be able to contact this person immediately. Name, phone, and email.',tags:[]},
{id:'s3_helper_ok',lbl:'Trusted helper has no financial interest in my estate',desc:'This is critical. The helper must be a disinterested party — a friend or colleague, not a beneficiary or creditor.',tags:["LEGAL"]},
],
s3g5:[
{id:'s3_rule1',lbl:'RULE: No one legitimate will ever ask for a seed phrase — for any reason',desc:'Not Ledger support. Not Coinbase. Not the government. Not a recovery expert. Anyone asking for seed phrases is stealing.',tags:["CRITICAL"]},
{id:'s3_rule2',lbl:'RULE: No legitimate service requires sending crypto to verify anything',desc:'If someone says to send crypto to verify ownership, receive a refund, or unlock an account — it is always a scam.',tags:["CRITICAL"]},
{id:'s3_rule3',lbl:'RULE: Wait at least 30 days before making any major crypto decisions',desc:'Grief impairs judgment. Scammers specifically target recently bereaved people. No legitimate opportunity expires in 30 days.',tags:["SECURITY"]},
{id:'s3_rule4',lbl:'RULE: Verify every URL manually before entering any credentials',desc:'Scammers create l3dger.com, co1nbase.com, etc. Type URLs manually — never click links from emails or text messages.',tags:["SECURITY"]},
{id:'s3_rule5',lbl:'RULE: Get a crypto-knowledgeable CPA or attorney before selling anything',desc:'The stepped-up basis rule alone could save your family significant tax money. Do not sell first and ask questions later.',tags:["LEGAL"]},
{id:'s3_shared',lbl:'I have personally shared these rules with your executor and she has read them',desc:'Have this conversation now, not when the crisis happens. Show her this checklist. Make sure she knows scammers target families in grief.',tags:["CRITICAL"]},
],
};
var TAG_CSS={CRITICAL:'background:#fee2e2;color:#b91c1c',LEGAL:'background:#e0e7ff;color:#3730a3',SECURITY:'background:#fef3c7;color:#92400e',CRYPTO:'background:#f0fdf4;color:#15803d',UPDATE:'background:#f5f3ff;color:#7c3aed'};
var TOKEN_LIST = [
  {t:'BTC',n:'Bitcoin',net:'Bitcoin'},
  {t:'ETH',n:'Ethereum',net:'Ethereum'},
  {t:'USDT',n:'Tether',net:'Ethereum/Multi'},
  {t:'BNB',n:'BNB',net:'BNB Chain'},
  {t:'SOL',n:'Solana',net:'Solana'},
  {t:'USDC',n:'USD Coin',net:'Ethereum/Multi'},
  {t:'XRP',n:'Ripple',net:'XRP Ledger'},
  {t:'DOGE',n:'Dogecoin',net:'Dogecoin'},
  {t:'TON',n:'Toncoin',net:'TON'},
  {t:'ADA',n:'Cardano',net:'Cardano'},
  {t:'SHIB',n:'Shiba Inu',net:'Ethereum'},
  {t:'AVAX',n:'Avalanche',net:'Avalanche'},
  {t:'TRX',n:'TRON',net:'TRON'},
  {t:'DOT',n:'Polkadot',net:'Polkadot'},
  {t:'LINK',n:'Chainlink',net:'Ethereum'},
  {t:'BCH',n:'Bitcoin Cash',net:'Bitcoin Cash'},
  {t:'NEAR',n:'NEAR Protocol',net:'NEAR'},
  {t:'MATIC',n:'Polygon',net:'Polygon'},
  {t:'LTC',n:'Litecoin',net:'Litecoin'},
  {t:'ICP',n:'Internet Computer',net:'IC'},
  {t:'UNI',n:'Uniswap',net:'Ethereum'},
  {t:'DAI',n:'Dai',net:'Ethereum/Multi'},
  {t:'APT',n:'Aptos',net:'Aptos'},
  {t:'ATOM',n:'Cosmos',net:'Cosmos'},
  {t:'XLM',n:'Stellar',net:'Stellar'},
  {t:'HBAR',n:'Hedera',net:'Hedera'},
  {t:'ETC',n:'Ethereum Classic',net:'ETC'},
  {t:'OKB',n:'OKB',net:'OKX Chain'},
  {t:'FIL',n:'Filecoin',net:'Filecoin'},
  {t:'ARB',n:'Arbitrum',net:'Arbitrum'},
  {t:'OP',n:'Optimism',net:'Optimism'},
  {t:'INJ',n:'Injective',net:'Injective'},
  {t:'STX',n:'Stacks',net:'Stacks'},
  {t:'IMX',n:'Immutable X',net:'Ethereum/IMX'},
  {t:'RNDR',n:'Render',net:'Solana/Ethereum'},
  {t:'AAVE',n:'Aave',net:'Ethereum'},
  {t:'VET',n:'VeChain',net:'VeChain'},
  {t:'WIF',n:'dogwifhat',net:'Solana'},
  {t:'GRT',n:'The Graph',net:'Ethereum'},
  {t:'MKR',n:'Maker',net:'Ethereum'},
  {t:'SUI',n:'Sui',net:'Sui'},
  {t:'ALGO',n:'Algorand',net:'Algorand'},
  {t:'THETA',n:'Theta Network',net:'Theta'},
  {t:'RUNE',n:'THORChain',net:'THORChain'},
  {t:'KAS',n:'Kaspa',net:'Kaspa'},
  {t:'PEPE',n:'Pepe',net:'Ethereum'},
  {t:'FTM',n:'Fantom',net:'Fantom'},
  {t:'SEI',n:'Sei',net:'Sei'},
  {t:'MANA',n:'Decentraland',net:'Ethereum'},
  {t:'SAND',n:'The Sandbox',net:'Ethereum'},
  {t:'AXS',n:'Axie Infinity',net:'Ronin/Ethereum'},
  {t:'GALA',n:'Gala',net:'Ethereum'},
  {t:'CRO',n:'Cronos',net:'Cronos'},
  {t:'EOS',n:'EOS',net:'EOSIO'},
  {t:'XTZ',n:'Tezos',net:'Tezos'},
  {t:'FLOW',n:'Flow',net:'Flow'},
  {t:'EGLD',n:'MultiversX',net:'MultiversX'},
  {t:'CFX',n:'Conflux',net:'Conflux'},
  {t:'KAVA',n:'Kava',net:'Kava'},
  {t:'CHZ',n:'Chiliz',net:'Chiliz'},
  {t:'1INCH',n:'1inch',net:'Ethereum'},
  {t:'LDO',n:'Lido DAO',net:'Ethereum'},
  {t:'DYDX',n:'dYdX',net:'Ethereum'},
  {t:'RPL',n:'Rocket Pool',net:'Ethereum'},
  {t:'CRV',n:'Curve DAO',net:'Ethereum'},
  {t:'SNX',n:'Synthetix',net:'Ethereum'},
  {t:'BAT',n:'Basic Attention Token',net:'Ethereum'},
  {t:'ZEC',n:'Zcash',net:'Zcash'},
  {t:'DASH',n:'Dash',net:'Dash'},
  {t:'XMR',n:'Monero',net:'Monero'},
  {t:'RVN',n:'Ravencoin',net:'Ravencoin'},
  {t:'DGB',n:'DigiByte',net:'DigiByte'},
  {t:'SC',n:'Siacoin',net:'Sia'},
  {t:'ZIL',n:'Zilliqa',net:'Zilliqa'},
  {t:'IOTA',n:'IOTA',net:'IOTA'},
  {t:'WAVES',n:'Waves',net:'Waves'},
  {t:'ONT',n:'Ontology',net:'Ontology'},
  {t:'NEO',n:'Neo',net:'Neo'},
  {t:'QTUM',n:'Qtum',net:'Qtum'},
  {t:'ICX',n:'ICON',net:'ICON'},
  {t:'ZEN',n:'Horizen',net:'Horizen'},
  {t:'MINA',n:'Mina Protocol',net:'Mina'},
  {t:'ROSE',n:'Oasis Network',net:'Oasis'},
  {t:'ONE',n:'Harmony',net:'Harmony'},
  {t:'CELO',n:'Celo',net:'Celo'},
  {t:'ANKR',n:'Ankr',net:'Ethereum/Multi'},
  {t:'SKL',n:'SKALE',net:'Ethereum'},
  {t:'CELR',n:'Celer Network',net:'Ethereum'},
  {t:'OGN',n:'Origin Protocol',net:'Ethereum'},
  {t:'BAND',n:'Band Protocol',net:'Band'},
  {t:'REN',n:'Ren',net:'Ethereum'},
  {t:'OCEAN',n:'Ocean Protocol',net:'Ethereum'},
  {t:'SUSHI',n:'SushiSwap',net:'Ethereum'},
  {t:'COMP',n:'Compound',net:'Ethereum'},
  {t:'YFI',n:'yearn.finance',net:'Ethereum'},
  {t:'BAL',n:'Balancer',net:'Ethereum'},
  {t:'ALPHA',n:'Alpha Venture DAO',net:'Ethereum'},
  {t:'KNC',n:'Kyber Network',net:'Ethereum'},
  {t:'XDC',n:'XinFin / XDC',net:'XDC Network'},
  {t:'FLR',n:'Flare',net:'Flare Network'},
  {t:'ZBCN',n:'Zebec Network',net:'Solana'},
  {t:'SOLO',n:'Sologenic',net:'XRP Ledger'},
  {t:'XCM',n:'CoinMetro',net:'CoinMetro'},
  {t:'VELO',n:'Velo Protocol',net:'Stellar/BNB'},
  {t:'ONDO',n:'Ondo Finance',net:'Ethereum'},
  {t:'AXL',n:'Axelar',net:'Axelar'},
  {t:'SGB',n:'Songbird',net:'Songbird'},
  {t:'CSPR',n:'Casper',net:'Casper'},
  {t:'BLUR',n:'Blur',net:'Ethereum'},
  {t:'MAGIC',n:'Magic',net:'Arbitrum'},
  {t:'GMX',n:'GMX',net:'Arbitrum'},
  {t:'JUP',n:'Jupiter',net:'Solana'},
  {t:'PYTH',n:'Pyth Network',net:'Solana'},
  {t:'W',n:'Wormhole',net:'Multi'},
  {t:'PENDLE',n:'Pendle',net:'Ethereum'},
  {t:'ENA',n:'Ethena',net:'Ethereum'},
  {t:'STRK',n:'Starknet',net:'Starknet'},
  {t:'ALT',n:'AltLayer',net:'Ethereum'},
  {t:'PIXEL',n:'Pixels',net:'Ronin'},
  {t:'PORTAL',n:'Portal',net:'Ethereum'},
  {t:'DYM',n:'Dymension',net:'Dymension'},
  {t:'TIA',n:'Celestia',net:'Celestia'},
  {t:'MANTA',n:'Manta',net:'Manta'},
  {t:'ZETA',n:'ZetaChain',net:'ZetaChain'},
  {t:'ACE',n:'Fusionist',net:'BNB Chain'},
  {t:'NFP',n:'NFPrompt',net:'BNB Chain'},
  {t:'ID',n:'SPACE ID',net:'BNB Chain'},
  {t:'BOME',n:'Book of Meme',net:'Solana'},
  {t:'WEN',n:'Wen',net:'Solana'},
  {t:'JTO',n:'Jito',net:'Solana'},
  {t:'POPCAT',n:'Popcat',net:'Solana'},
  {t:'BONK',n:'Bonk',net:'Solana'},
  {t:'WLD',n:'Worldcoin',net:'Ethereum/Optimism'},
  {t:'CYBER',n:'CyberConnect',net:'Ethereum'},
  {t:'ARKM',n:'Arkham',net:'Ethereum'},
  {t:'FRIEND',n:'friend.tech',net:'Base'},
  {t:'BASE',n:'Base',net:'Base'},
  {t:'ORB',n:'Orb',net:'Base'},
  {t:'AERO',n:'Aerodrome',net:'Base'},
  {t:'BRETT',n:'Brett',net:'Base'},
  {t:'MOG',n:'Mog Coin',net:'Ethereum'},
  {t:'FLOKI',n:'Floki',net:'Ethereum/BNB'},
  {t:'BABYDOGE',n:'Baby Doge Coin',net:'BNB Chain'},
  {t:'ELON',n:'Dogelon Mars',net:'Ethereum'},
  {t:'KISHU',n:'Kishu Inu',net:'Ethereum'},
  {t:'AKITA',n:'Akita Inu',net:'Ethereum'},
  {t:'SAMO',n:'Samoyedcoin',net:'Solana'},
  {t:'COPE',n:'COPE',net:'Solana'},
  {t:'FIDA',n:'Bonfida',net:'Solana'},
  {t:'MAPS',n:'MAPS',net:'Solana'},
  {t:'OXY',n:'Oxygen',net:'Solana'},
  {t:'STEP',n:'Step Finance',net:'Solana'},
  {t:'SRM',n:'Serum',net:'Solana'},
  {t:'RAY',n:'Raydium',net:'Solana'},
  {t:'TULIP',n:'Tulip Protocol',net:'Solana'},
  {t:'PORT',n:'Port Finance',net:'Solana'},
  {t:'SLND',n:'Solend',net:'Solana'},
  {t:'DEGEN',n:'Degen',net:'Base'},
  {t:'HIGHER',n:'Higher',net:'Base'},
  {t:'TOSHI',n:'Toshi',net:'Base'},
  {t:'BUILD',n:'Build',net:'Base'},
  {t:'NORMIE',n:'Normie',net:'Base'},
  {t:'DOGINME',n:'Doginme',net:'Base'},
  {t:'PRIME',n:'Echelon Prime',net:'Ethereum'},
  {t:'GODS',n:'Gods Unchained',net:'Ethereum/IMX'},
  {t:'BEAM',n:'Beam',net:'Beam'},
  {t:'RONIN',n:'Ronin',net:'Ronin'},
  {t:'SLP',n:'Smooth Love Potion',net:'Ronin'},
  {t:'AGS',n:'Collector Coin',net:'BNB'},
  {t:'BURGER',n:'BurgerSwap',net:'BNB'},
  {t:'CAKE',n:'PancakeSwap',net:'BNB'},
  {t:'XVS',n:'Venus',net:'BNB'},
  {t:'BAKE',n:'BakeryToken',net:'BNB'},
  {t:'AUTO',n:'Auto',net:'BNB'},
  {t:'ALPACA',n:'Alpaca Finance',net:'BNB'},
  {t:'BELT',n:'Belt Finance',net:'BNB'},
  {t:'FOR',n:'ForTube',net:'BNB'},
  {t:'DODO',n:'DODO',net:'Ethereum/BNB'},
  {t:'MDX',n:'Mdex',net:'BNB/HECO'},
  {t:'BFT',n:'BnkToTheFuture',net:'Ethereum'},
  {t:'PHA',n:'Phala Network',net:'Polkadot'},
  {t:'KSM',n:'Kusama',net:'Kusama'},
  {t:'ACA',n:'Acala',net:'Polkadot'},
  {t:'PARA',n:'Paralink',net:'Polkadot'},
  {t:'GLMR',n:'Moonbeam',net:'Polkadot'},
  {t:'MOVR',n:'Moonriver',net:'Kusama'},
  {t:'SDN',n:'Shiden',net:'Kusama'},
  {t:'HKO',n:'Acala Dollar',net:'Polkadot'},
  {t:'AUSD',n:'Acala USD',net:'Polkadot'},
  {t:'LDOT',n:'Liquid DOT',net:'Polkadot'},
  {t:'INTR',n:'Interlay',net:'Polkadot'},
  {t:'KINT',n:'Kintsugi',net:'Kusama'},
  {t:'AIR',n:'AirSwap',net:'Ethereum'},
  {t:'CVX',n:'Convex Finance',net:'Ethereum'},
  {t:'FXS',n:'Frax Share',net:'Ethereum'},
  {t:'FRAX',n:'Frax',net:'Ethereum'},
  {t:'LUSD',n:'Liquity USD',net:'Ethereum'},
  {t:'LQTY',n:'Liquity',net:'Ethereum'},
  {t:'SPELL',n:'Spell Token',net:'Ethereum/Avalanche'},
  {t:'MIM',n:'Magic Internet Money',net:'Ethereum'},
  {t:'TIME',n:'Wonderland',net:'Avalanche'},
  {t:'WMEMO',n:'Wrapped MEMO',net:'Avalanche'},
  {t:'JOE',n:'Trader Joe',net:'Avalanche'},
  {t:'PNG',n:'Pangolin',net:'Avalanche'},
  {t:'XAVA',n:'Avalaunch',net:'Avalanche'},
  {t:'QI',n:'BENQI',net:'Avalanche'},
  {t:'BIFI',n:'Beefy Finance',net:'Multi'},
  {t:'GRAIL',n:'Camelot',net:'Arbitrum'},
  {t:'RDNT',n:'Radiant Capital',net:'Arbitrum'},
  {t:'VELA',n:'Vela Exchange',net:'Arbitrum'},
  {t:'UMAMI',n:'Umami Finance',net:'Arbitrum'},
  {t:'JONES',n:'Jones DAO',net:'Arbitrum'},
  {t:'DPEX',n:'Dopex',net:'Arbitrum'},
  {t:'WINR',n:'JustBet',net:'Arbitrum'},
  {t:'MYSO',n:'Myso Finance',net:'Arbitrum'},
  {t:'PREMIA',n:'Premia',net:'Arbitrum'},
  {t:'LYRA',n:'Lyra Finance',net:'Optimism'},
  {t:'THALES',n:'Thales',net:'Optimism'},
  {t:'KWENTA',n:'Kwenta',net:'Optimism'},
  {t:'USD+',n:'USD+',net:'Optimism'},
  {t:'BEETS',n:'Beethoven X',net:'Fantom'},
  {t:'SPIRIT',n:'SpiritSwap',net:'Fantom'},
  {t:'BOO',n:'SpookySwap',net:'Fantom'},
  {t:'TOMB',n:'Tomb Finance',net:'Fantom'},
  {t:'BASED',n:'Based Finance',net:'Fantom'},
  {t:'TAROT',n:'Tarot',net:'Fantom'},
  {t:'HEC',n:'Hector DAO',net:'Fantom'},
  {t:'SCREAM',n:'Scream',net:'Fantom'},
  {t:'GEIST',n:'Geist Finance',net:'Fantom'},
  {t:'YVAULT',n:'yVault.finance',net:'Fantom'},
  {t:'SOLID',n:'Solidly',net:'Fantom'},
  {t:'SEX',n:'Solidex',net:'Fantom'},
  {t:'MORPH',n:'Morpho',net:'Ethereum'},
  {t:'EULER',n:'Euler',net:'Ethereum'},
  {t:'NOTIONAL',n:'Notional',net:'Ethereum'},
  {t:'IDLE',n:'Idle',net:'Ethereum'},
  {t:'RBN',n:'Ribbon Finance',net:'Ethereum'},
  {t:'OPYN',n:'Opyn',net:'Ethereum'},
  {t:'PODS',n:'Pods Finance',net:'Ethereum'},
  {t:'HEGIC',n:'Hegic',net:'Ethereum'},
  {t:'ACO',n:'ACO Protocol',net:'Ethereum'},
  {t:'ZRXP',n:'ZRX Protocol',net:'Ethereum'},
  {t:'ROUTE',n:'Route',net:'Ethereum'},
  {t:'INCH',n:'1inch',net:'Ethereum'},
  {t:'AGIX',n:'SingularityNET',net:'Ethereum/Cardano'},
  {t:'FET',n:'Fetch.ai',net:'Ethereum'},
  {t:'NMR',n:'Numeraire',net:'Ethereum'},
  {t:'GNO',n:'Gnosis',net:'Ethereum'},
  {t:'COW',n:'CoW Protocol',net:'Ethereum'},
  {t:'SAFE',n:'Safe',net:'Ethereum'},
  {t:'ENS',n:'Ethereum Name Service',net:'Ethereum'},
  {t:'LPT',n:'Livepeer',net:'Ethereum'},
  {t:'NKN',n:'NKN',net:'Ethereum'},
  {t:'STORJ',n:'Storj',net:'Ethereum'},
  {t:'CTSI',n:'Cartesi',net:'Ethereum'},
  {t:'ORN',n:'Orion Protocol',net:'Ethereum'},
  {t:'BLZ',n:'Bluzelle',net:'Ethereum'},
  {t:'TOMO',n:'TomoChain',net:'TomoChain'},
  {t:'WAN',n:'Wanchain',net:'Wanchain'},
  {t:'VEX',n:'Vexanium',net:'Ethereum'},
  {t:'XHV',n:'Haven Protocol',net:'Monero'},
  {t:'DERO',n:'Dero',net:'Dero'},
  {t:'GRIN',n:'Grin',net:'Mimblewimble'},
  {t:'MWC',n:'MimbleWimble Coin',net:'MWC'},
  {t:'XWP',n:'Swap',net:'XWP'},
  {t:'OXEN',n:'Oxen',net:'Oxen'},
  {t:'LOKI',n:'Loki',net:'Loki'},
  {t:'PIVX',n:'PIVX',net:'PIVX'},
  {t:'FIRO',n:'Firo',net:'Firo'},
  {t:'NAV',n:'NavCoin',net:'NavCoin'},
  {t:'NIX',n:'NIX',net:'NIX'},
  {t:'ZCOIN',n:'Firo',net:'Firo'},
  {t:'ALIAS',n:'Spectrecoin',net:'Spectrecoin'},
  {t:'XVG',n:'Verge',net:'Verge'},
  {t:'BCN',n:'Bytecoin',net:'Bytecoin'},
  {t:'XDN',n:'DigitalNote',net:'DigitalNote'},
  {t:'TUBE',n:'BitTube',net:'BitTube'},
  {t:'TRTL',n:'TurtleCoin',net:'TurtleCoin'},
  {t:'SERO',n:'Super Zero',net:'SERO'},
  {t:'PHALA',n:'Phala',net:'Polkadot'},
  {t:'KIN',n:'Kin',net:'Solana'},
  {t:'MEDIA',n:'Media Network',net:'Solana'},
  {t:'STAR',n:'StarLaunch',net:'Solana'},
  {t:'LARIX',n:'Larix',net:'Solana'},
  {t:'SLIM',n:'Solanium',net:'Solana'},
  {t:'SUNNY',n:'Sunny Aggregator',net:'Solana'},
  {t:'GRAPE',n:'Grape Protocol',net:'Solana'},
  {t:'MNGO',n:'Mango Markets',net:'Solana'},
  {t:'SERUM',n:'Serum',net:'Solana'},
  {t:'MSOL',n:'Marinade staked SOL',net:'Solana'},
  {t:'STSOL',n:'Lido Staked SOL',net:'Solana'},
  {t:'JSOL',n:'JPOOL SOL',net:'Solana'},
];

var CEC_STEP_GROUPS = {
  1: ['s1g1','s1g2','s1g3','s1g4'],
  2: ['s2g1','s2g2','s2g3','s2g4','s2g5'],
  3: ['s3g1','s3g2','s3g3','s3g4','s3g5']
};
var CEC_CARDS = {
  1: ['s1c1','s1c2','s1c3','s1c4'],
  2: ['s2c1','s2c2','s2c3','s2c4','s2c5'],
  3: ['s3c1','s3c2','s3c3','s3c4','s3c5','s3c6']
};

// ── TOKEN ROSTER FUNCTIONS ───────────────────────────────────
function cecLoadMyTokens() {
  var tbody = document.getElementById('cec-roster-body');
  if(!tbody) return;
  if(tbody.querySelectorAll('tr').length > 0) {
    if(!confirm('Replace current rows with your 13 default tokens?')) return;
  }
  tbody.innerHTML = '';
  MY_TOKENS.forEach(function(t) { cecAddRosterRow(t.tok, t.name, t.net, t.wallet); });
}

function cecAddRosterRow(tok, name, net, wallet) {
  var tbody = document.getElementById('cec-roster-body');
  if(!tbody) return;
  var tr = document.createElement('tr');
  var uid = 'dl' + Date.now() + Math.random().toString(36).slice(2,5);
  var tokOpts = TOKEN_LIST.slice(0,300).map(function(t) {
    return '<option value="' + t.t + '">' + t.t + ' — ' + t.n + '</option>';
  }).join('');
  var netOpts = ['Bitcoin','Ethereum','XRP Ledger','Solana','BNB Chain','Cardano',
    'Polkadot','Avalanche','Polygon','Arbitrum','Optimism','Fantom','Hedera',
    'Stellar','XDC Network','Flare Network','Casper','Axelar','Songbird',
    'Multi-chain','Other'].map(function(n) {
    return '<option value="' + n + '">' + n + '</option>';
  }).join('');
  var walletOpts = ['Ledger Nano X','Ledger Nano S','Trezor Model T','XUMM / Xaman',
    'HashPack','Bifrost Wallet','MetaMask','Trust Wallet','Phantom','Coinbase Exchange',
    'Coinbase Wallet','Kraken','Binance','Bybit','KuCoin','CoinMetro','OKX',
    'Gate.io','Huobi','Other'].map(function(w) {
    return '<option value="' + w + '">' + w + '</option>';
  }).join('');

  tr.innerHTML =
    '<td style="min-width:110px">' +
      '<select class="cti tok-sel" data-on-change="cecTokenSelect(this)" style="margin-bottom:3px">' +
        '<option value="">-- pick or type --</option>' + tokOpts +
      '</select>' +
      '<input list="' + uid + '" class="cti tok-ticker" value="' + (tok||'') + '" placeholder="Ticker" data-on-input="cecTickerInput(this)">' +
      '<datalist id="' + uid + '">' + TOKEN_LIST.slice(0,300).map(function(t){return '<option value="'+t.t+'">';}).join('') + '</datalist>' +
    '</td>' +
    '<td><input class="cti tok-name" value="' + (name||'') + '" placeholder="Full name"></td>' +
    '<td>' +
      '<select class="cti tok-net-sel" data-on-change="cecNetChange(this)">' +
        '<option value="">-- select --</option>' + netOpts +
        '<option value="_manual">Enter manually...</option>' +
      '</select>' +
      '<input class="cti tok-net-manual" placeholder="Type network..." style="display:none;margin-top:3px">' +
    '</td>' +
    '<td>' +
      '<select class="cti tok-wallet-sel" data-on-change="cecWalletChange(this)">' +
        '<option value="">-- select --</option>' + walletOpts +
        '<option value="_manual">Enter manually...</option>' +
      '</select>' +
      '<input class="cti tok-wallet-manual" placeholder="Type wallet/exchange..." style="display:none;margin-top:3px">' +
    '</td>' +
    '<td><input class="cti tok-amount" value="" placeholder="e.g. 1,250"></td>' +
    '<td><input class="cti tok-usd" value="" placeholder="e.g. $4,800"></td>' +
    '<td style="text-align:center"><input type="checkbox" class="ctck tok-done"></td>' +
    '<td style="text-align:center"><button class="btn btn-bad btn-xs" data-on-click="cecRemoveRow(this)" title="Remove this token row">&#10005;</button></td>';
  tbody.appendChild(tr);

  // Pre-fill network dropdown
  if(net) {
    var nsel = tr.querySelector('.tok-net-sel');
    var found = false;
    for(var i = 0; i < nsel.options.length; i++) {
      if(nsel.options[i].value === net || nsel.options[i].text === net) {
        nsel.value = nsel.options[i].value; found = true; break;
      }
    }
    if(!found) {
      nsel.value = '_manual';
      var nm = tr.querySelector('.tok-net-manual');
      if(nm) { nm.style.display = 'block'; nm.value = net; }
    }
  }
  // Pre-fill wallet dropdown
  if(wallet) {
    var wsel = tr.querySelector('.tok-wallet-sel');
    var found2 = false;
    for(var j = 0; j < wsel.options.length; j++) {
      if(wsel.options[j].value === wallet || wsel.options[j].text === wallet) {
        wsel.value = wsel.options[j].value; found2 = true; break;
      }
    }
    if(!found2) {
      wsel.value = '_manual';
      var wm = tr.querySelector('.tok-wallet-manual');
      if(wm) { wm.style.display = 'block'; wm.value = wallet; }
    }
  }

  // Wire change handlers
  tr.querySelector('.tok-net-sel').addEventListener('change', function() {
    cecNetChange(this);
  });
  tr.querySelector('.tok-wallet-sel').addEventListener('change', function() {
    cecWalletChange(this);
  });
}

function cecNetChange(sel) {
  var manual = sel.parentElement.querySelector('.tok-net-manual');
  if(manual) manual.style.display = sel.value === '_manual' ? 'block' : 'none';
}
function cecWalletChange(sel) {
  var manual = sel.parentElement.querySelector('.tok-wallet-manual');
  if(manual) manual.style.display = sel.value === '_manual' ? 'block' : 'none';
}

function cecTokenSelect(sel) {
  var val = sel.value;
  if(!val) return;
  var found = TOKEN_LIST.find(function(t) { return t.t === val; });
  if(!found) return;
  var row = sel.closest('tr');
  if(!row) return;
  var ticker = row.querySelector('.tok-ticker'); if(ticker) ticker.value = found.t;
  var name   = row.querySelector('.tok-name');   if(name && !name.value) name.value = found.n;
  _cecFillNet(row, found.net);
}

function cecTickerInput(inp) {
  var val = inp.value.toUpperCase().trim();
  if(!val) return;
  var found = TOKEN_LIST.find(function(t) { return t.t === val; });
  if(!found) return;
  var row = inp.closest('tr'); if(!row) return;
  var name = row.querySelector('.tok-name'); if(name && !name.value) name.value = found.n;
  // Update dropdown too
  var sel = row.querySelector('.tok-sel'); 
  if(sel) sel.value = found.t;
  _cecFillNet(row, found.net);
}

function _cecFillNet(row, net) {
  var nsel = row.querySelector('.tok-net-sel'); if(!nsel) return;
  var found = false;
  for(var i = 0; i < nsel.options.length; i++) {
    if(nsel.options[i].value === net || nsel.options[i].text === net) {
      nsel.value = nsel.options[i].value; found = true; break;
    }
  }
  if(!found) {
    nsel.value = '_manual';
    var nm = row.querySelector('.tok-net-manual');
    if(nm) { nm.style.display = 'block'; if(!nm.value) nm.value = net; }
  } else {
    var nm2 = row.querySelector('.tok-net-manual');
    if(nm2) nm2.style.display = 'none';
  }
}

function cecRemoveRow(btn) {
  var tr = btn.closest('tr');
  if(!tr) return;
  if(!confirm('Remove this token from your inventory?')) return;
  tr.remove();
  toast('Token row removed.', 'success');
}

// ── CEC RENDER ───────────────────────────────────────────────
function cecRenderChecks() {
  Object.keys(CHECKS).forEach(function(grpId) {
    var el = document.getElementById('cec-' + grpId);
    if(!el) return;
    el.innerHTML = '';
    CHECKS[grpId].forEach(function(item) {
      var div = document.createElement('div');
      div.className = 'cec-ci' + (ceChecks[item.id] ? ' done' : '');
      div.id = 'cec-ci-' + item.id;
      div.onclick = function() { cecToggleCheck(item.id); };
      var tags = (item.tags || []).map(function(t) {
        return '<span style="display:inline-block;font-family:monospace;font-size:9.5px;padding:2px 7px;border-radius:4px;margin:3px 3px 0 0;' + (TAG_CSS[t] || '') + '">' + t + '</span>';
      }).join('');
      div.innerHTML =
        '<div class="cec-cibox"><span class="cec-citk">&#10003;</span></div>' +
        '<div class="cec-cibody">' +
          '<div class="cec-cil">' + item.lbl + '</div>' +
          (item.desc ? '<div class="cec-cid">' + item.desc + '</div>' : '') +
          (item.why  ? '<div class="cec-ciw">' + item.why  + '</div>' : '') +
          (tags ? '<div style="margin-top:3px">' + tags + '</div>' : '') +
        '</div>';
      el.appendChild(div);
    });
  });
  cecUpdateScores();
}

function cecRenderTokenGuide() {
  var el = document.getElementById('cec-token-guide');
  if(!el) return;
  el.innerHTML = MY_TOKENS.map(function(t) {
    return '<div style="margin-bottom:12px;padding:11px 13px;background:var(--slate);border-radius:8px;border-left:3px solid var(--s3)">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap">' +
        '<span style="font-family:monospace;font-weight:700;color:var(--navy);font-size:13px">' + t.tok + '</span>' +
        '<span style="font-size:12px;color:var(--text2)">' + t.name + '</span>' +
        '<span style="font-family:monospace;font-size:10px;background:rgba(124,58,237,.1);color:var(--s3);padding:2px 7px;border-radius:4px;margin-left:auto">' + t.net + '</span>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:4px"><strong>Typical wallet:</strong> ' + t.wallet + '</div>' +
      '<div style="font-size:11.5px;color:var(--muted);line-height:1.45;margin-bottom:7px">' + t.note + '</div>' +
      '<label style="font-size:11px;color:var(--muted);font-weight:600;display:block;margin-bottom:3px">Your notes for ' + t.tok + '</label>' +
      '<input class="finp" id="cec-tn-' + t.tok.toLowerCase() + '" placeholder="Where stored, account details, special instructions..." style="font-size:12px">' +
      '</div>';
  }).join('');
}

function cecToggleCheck(id) {
  ceChecks[id] = !ceChecks[id];
  var el = document.getElementById('cec-ci-' + id);
  if(el) el.className = 'cec-ci' + (ceChecks[id] ? ' done' : '');
  cecUpdateScores();
  saveCEC();
}

function cecUpdateScores() {
  [1, 2, 3].forEach(function(s) {
    var total = 0, done = 0;
    (CEC_STEP_GROUPS[s] || []).forEach(function(g) {
      (CHECKS[g] || []).forEach(function(item) { total++; if(ceChecks[item.id]) done++; });
    });
    var pct = total ? Math.round(done / total * 100) : 0;
    var el;
    el = document.getElementById('csc' + s);       if(el) el.textContent = pct + '%';
    el = document.getElementById('cpf' + s);       if(el) el.style.width = pct + '%';
    el = document.getElementById('cpp' + s);       if(el) el.textContent = done + '/' + total;
    el = document.getElementById('dash-cpf' + s);  if(el) el.style.width = pct + '%';
    el = document.getElementById('dash-cpp' + s);  if(el) el.textContent = pct + '%';
  });
}

function cecToggleCard(id) {
  var b = document.getElementById('ccbody-' + id);
  var c = document.getElementById('cchev-' + id);
  if(!b) return;
  var open = b.classList.contains('op');
  b.className = 'cec-cbody' + (open ? '' : ' op');
  if(c) c.className = 'cec-chev' + (open ? '' : ' op');
}
function cecExpandAll(s) {
  (CEC_CARDS[s] || []).forEach(function(id) {
    var b = document.getElementById('ccbody-' + id);
    var c = document.getElementById('cchev-' + id);
    if(b) b.className = 'cec-cbody op';
    if(c) c.className = 'cec-chev op';
  });
}
function cecCollapseAll(s) {
  (CEC_CARDS[s] || []).forEach(function(id) {
    var b = document.getElementById('ccbody-' + id);
    var c = document.getElementById('cchev-' + id);
    if(b) b.className = 'cec-cbody';
    if(c) c.className = 'cec-chev';
  });
}

function saveCEC() {
  var data = { checks: ceChecks, inputs: {} };
  document.querySelectorAll('[id^="cec-"]').forEach(function(el) {
    if(el.id && ((el.tagName === 'INPUT' && el.type !== 'checkbox') || el.tagName === 'TEXTAREA'))
      data.inputs[el.id] = el.value;
  });
  try { localStorage.setItem(SKEY_CEC, JSON.stringify(data)); } catch(e) {}
  toast('Saved.', 'success');
}

function loadCEC() {
  try {
    var raw = localStorage.getItem(SKEY_CEC);
    if(!raw) return;
    var data = JSON.parse(raw);
    if(data.checks) ceChecks = data.checks;
    if(data.inputs) {
      setTimeout(function() {
        Object.keys(data.inputs).forEach(function(id) {
          var el = document.getElementById(id);
          if(el && el.tagName === 'INPUT' && el.type !== 'checkbox') el.value = data.inputs[id] || '';
          if(el && el.tagName === 'TEXTAREA') el.value = data.inputs[id] || '';
        });
      }, 250);
    }
  } catch(e) {}
}

// ── INIT ─────────────────────────────────────────────────────
(function() {
  loadST();
  loadCEC();
  cecRenderChecks();
  cecRenderTokenGuide();
  cecLoadMyTokens();
  refreshAll();
  setTimeout(function() {
    loadCEC();
    cecRenderChecks();
    cecUpdateScores();
    setupBenAlert();
  }, 350);
  setInterval(function() {
    if(typeof refreshCiUI === 'function') refreshCiUI();
  }, 1000);
})();


// ═══════════════════════════════════════════════════════════
// VAULT PASSCODE SYSTEM
// ═══════════════════════════════════════════════════════════

var VPC_KEY  = 'tv_vpc_v4';   // stores hash of passcode
var VPC_SALT = 'tv_vps_v4';   // stores salt
var VPC_TYPE = 'tv_vpt_v4';   // stores 'pin' or 'alpha'
var VPC_IDLE = 'tv_vpi_v4';   // stores idle lock minutes

var _lsPin     = '';           // current PIN being entered
var _lsMode    = 'pin';        // 'pin' or 'alpha'
var _lsAttempts= 0;
var _lsLocked  = false;
var _idleTimer = null;
var _lastActivity = Date.now();

// ── HASH ────────────────────────────────────────────────────
function vpcHashLegacy(passcode, salt) {   /* OLD 32-bit hash — only used to recognise and upgrade existing installs */
  var combined = salt + '::trustvault::' + passcode;
  var h = 5381;
  for (var round = 0; round < 1000; round++) {
    for (var i = 0; i < combined.length; i++) {
      h = ((h << 5) + h) ^ combined.charCodeAt(i);
      h = h & h;
    }
    combined = h.toString(16) + combined + salt;
  }
  return h.toString(16);
}
function vpcHash(passcode, salt) { return 'v2$' + _pbkdf2Hex(passcode, salt + '::trustvault', _KDF_ITER); }

function vpcGenSalt() { return _rndHex(16); }   /* CSPRNG, not Math.random */

// ── STATE HELPERS ────────────────────────────────────────────
function vpcIsSet()   { return !!localStorage.getItem(VPC_KEY); }
function vpcGetType() { return localStorage.getItem(VPC_TYPE) || 'pin'; }

function vpcSave(passcode, type) {
  var salt = vpcGenSalt();
  localStorage.setItem(VPC_SALT, salt);
  localStorage.setItem(VPC_KEY,  vpcHash(passcode, salt));
  localStorage.setItem(VPC_TYPE, type);
}

function vpcVerify(passcode) {
  var salt  = localStorage.getItem(VPC_SALT) || '';
  var stored = localStorage.getItem(VPC_KEY)  || '';
  if (stored.indexOf('v2$') === 0) return _ctEq(vpcHash(passcode, salt), stored);
  if (stored && _ctEq(vpcHashLegacy(passcode, salt), stored)) { vpcSave(passcode, vpcGetType()); return true; }   /* upgrade old hash */
  return false;
}

function vpcRemove() {
  localStorage.removeItem(VPC_KEY);
  localStorage.removeItem(VPC_SALT);
  localStorage.removeItem(VPC_TYPE);
}

// ── IDLE AUTO-LOCK ───────────────────────────────────────────
function vpcResetIdle() { _lastActivity = Date.now(); }

function vpcStartIdleWatcher() {
  ['click','keydown','touchstart','mousemove'].forEach(function(ev) {
    document.addEventListener(ev, vpcResetIdle, { passive: true });
  });
  if (_idleTimer) clearInterval(_idleTimer);
  _idleTimer = setInterval(function() {
    if (!vpcIsSet()) return;
    var idleMins = parseInt(localStorage.getItem(VPC_IDLE)) || 5;
    if (idleMins === 0) return; // 0 = never auto-lock
    var idleMs = idleMins * 60 * 1000;
    var app = document.getElementById('app');
    if (app && app.style.display !== 'none') {
      if (Date.now() - _lastActivity > idleMs) {
        vpcLockApp();
      }
    }
  }, 15000); // check every 15 seconds
}

// ── LOCK / UNLOCK FLOW ───────────────────────────────────────
function vpcLockApp() {
  _lsLocked = true;
  _lsPin = '';
  _lsAttempts = 0;
  lsUpdateDots();
  document.getElementById('app').style.display    = 'none';
  document.getElementById('landing').style.display = 'none';
  document.getElementById('lock-screen').style.display = 'block';
  var err = document.getElementById('ls-err');
  if (err) err.textContent = '';
  var att = document.getElementById('ls-attempts');
  if (att) att.textContent = '';
  // Set correct mode for lock screen
  var type = vpcGetType();
  _lsMode = type;
  lsApplyMode();
  vpcResetIdle();
}

function vpcUnlockApp() {
  _lsLocked = false;
  _lsAttempts = 0;
  _lsPin = '';
  document.getElementById('lock-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  vpcResetIdle();
  loadST(); refreshAll();
  setTimeout(function() { cecUpdateScores(); setupBenAlert(); }, 300);
}

// ── OVERRIDE enterApp ────────────────────────────────────────
function enterApp() {
  if (vpcIsSet()) {
    // Show lock screen
    document.getElementById('landing').style.display = 'none';
    vpcLockApp();
  } else {
    // No passcode set — show setup prompt first time
    document.getElementById('landing').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    loadST(); refreshAll();
    setTimeout(function() {
      cecUpdateScores(); setupBenAlert();
      // Offer to set passcode if never done
      if (!localStorage.getItem('tv_vpc_offered')) {
        localStorage.setItem('tv_vpc_offered', '1');
        openM('m-passcode-setup');
      }
    }, 400);
  }
}

function lsBack() {
  document.getElementById('lock-screen').style.display = 'none';
  document.getElementById('landing').style.display = 'flex';
  _lsPin = '';
  lsUpdateDots();
}

// ── PIN PAD ──────────────────────────────────────────────────
function lsKey(k) {
  var err = document.getElementById('ls-err');
  if (err && err.textContent) { err.textContent = ''; }

  if (_lsMode === 'pin') {
    if (_lsPin.length >= 4) return;
    _lsPin += k;
    lsUpdateDots();
    if (_lsPin.length === 4) {
      setTimeout(lsSubmit, 120); // slight delay so last dot visually fills
    }
  } else {
    var inp = document.getElementById('ls-alpha-inp');
    if (inp) { inp.value += k; }
  }
}

function lsDel() {
  if (_lsMode === 'pin') {
    _lsPin = _lsPin.slice(0, -1);
    lsUpdateDots();
  } else {
    var inp = document.getElementById('ls-alpha-inp');
    if (inp && inp.value.length > 0) inp.value = inp.value.slice(0, -1);
  }
}

function lsUpdateDots() {
  for (var i = 0; i < 4; i++) {
    var dot = document.getElementById('pd' + i);
    if (!dot) continue;
    dot.className = 'pindot' + (i < _lsPin.length ? ' filled' : '');
  }
}

function lsToggleMode() {
  _lsMode = (_lsMode === 'pin') ? 'alpha' : 'pin';
  lsApplyMode();
}

function lsApplyMode() {
  var pinpad  = document.getElementById('ls-pinpad');
  var alphaW  = document.getElementById('ls-alpha-wrap');
  var modeBtn = document.getElementById('ls-mode-btn');
  var dots    = document.getElementById('ls-dots');
  if (_lsMode === 'pin') {
    if (pinpad)  pinpad.style.display  = 'grid';
    if (alphaW)  alphaW.style.display  = 'none';
    if (dots)    dots.style.display    = 'flex';
    if (modeBtn) modeBtn.textContent   = 'ABC';
  } else {
    if (pinpad)  pinpad.style.display  = 'none';
    if (alphaW)  alphaW.style.display  = 'block';
    if (dots)    dots.style.display    = 'none';
    if (modeBtn) modeBtn.textContent   = '123';
    var inp = document.getElementById('ls-alpha-inp');
    if (inp) { inp.value = ''; setTimeout(function(){inp.focus();}, 100); }
  }
}

function lsAlphaInput(inp) { /* just lets user type */ }

function lsSubmit() {
  var passcode = '';
  if (_lsMode === 'pin') {
    passcode = _lsPin;
    if (passcode.length < 4) return;
  } else {
    var inp = document.getElementById('ls-alpha-inp');
    passcode = inp ? inp.value : '';
    if (!passcode) return;
  }

  if (vpcVerify(passcode)) {
    // Success — flash dots green then unlock
    for (var i = 0; i < 4; i++) {
      var dot = document.getElementById('pd' + i);
      if (dot) dot.style.background = '#22c55e';
    }
    _lsPin = '';
    setTimeout(vpcUnlockApp, 280);
  } else {
    // Wrong passcode
    _lsAttempts++;
    _lsPin = '';
    lsUpdateDots();
    // Shake dots red
    for (var j = 0; j < 4; j++) {
      var dot2 = document.getElementById('pd' + j);
      if (dot2) { dot2.className = 'pindot error'; }
    }
    setTimeout(function() {
      for (var k = 0; k < 4; k++) {
        var dot3 = document.getElementById('pd' + k);
        if (dot3) dot3.className = 'pindot';
      }
    }, 500);
    var err = document.getElementById('ls-err');
    if (err) err.textContent = 'Incorrect passcode. Try again.';
    // Clear alpha input
    var ainp = document.getElementById('ls-alpha-inp');
    if (ainp) ainp.value = '';
    // Show attempt count after 3 failures
    if (_lsAttempts >= 3) {
      var att = document.getElementById('ls-attempts');
      if (att) att.textContent = _lsAttempts + ' failed attempt' + (_lsAttempts > 1 ? 's' : '');
    }
  }
}

// Physical keyboard support on lock screen
document.addEventListener('keydown', function(e) {
  var ls = document.getElementById('lock-screen');
  if (!ls || ls.style.display === 'none') return;
  if (_lsMode !== 'pin') return; // alpha mode uses the input field
  if (e.key >= '0' && e.key <= '9') { lsKey(e.key); e.preventDefault(); }
  if (e.key === 'Backspace') { lsDel(); e.preventDefault(); }
  if (e.key === 'Enter') { lsSubmit(); e.preventDefault(); }
});

// ── PASSCODE SETUP MODAL ─────────────────────────────────────
function mpcSetTab(tab) {
  _lsMode = tab;
  var pinW  = document.getElementById('mpc-pin-wrap');
  var alpW  = document.getElementById('mpc-alpha-wrap');
  var tabP  = document.getElementById('mpc-tab-pin');
  var tabA  = document.getElementById('mpc-tab-alpha');
  if (tab === 'pin') {
    if (pinW)  pinW.style.display  = 'block';
    if (alpW)  alpW.style.display  = 'none';
    if (tabP)  { tabP.className = 'btn btn-primary btn-sm'; tabP.style.flex = '1'; }
    if (tabA)  { tabA.className = 'btn btn-ghost btn-sm';   tabA.style.flex = '1'; }
  } else {
    if (pinW)  pinW.style.display  = 'none';
    if (alpW)  alpW.style.display  = 'block';
    if (tabP)  { tabP.className = 'btn btn-ghost btn-sm';   tabP.style.flex = '1'; }
    if (tabA)  { tabA.className = 'btn btn-primary btn-sm'; tabA.style.flex = '1'; }
    var inp = document.getElementById('mpc-alpha1');
    if (inp) setTimeout(function(){inp.focus();}, 100);
  }
  var err = document.getElementById('mpc-err');
  if (err) err.textContent = '';
}

function mpcSave() {
  var err  = document.getElementById('mpc-err');
  var type = document.getElementById('mpc-pin-wrap') &&
             document.getElementById('mpc-pin-wrap').style.display !== 'none'
             ? 'pin' : 'alpha';
  var p1, p2;
  if (type === 'pin') {
    p1 = (document.getElementById('mpc-pin1') || {}).value || '';
    p2 = (document.getElementById('mpc-pin2') || {}).value || '';
    if (!/^[0-9]{4}$/.test(p1)) {
      if (err) err.textContent = 'PIN must be exactly 4 digits (0-9).'; return;
    }
  } else {
    p1 = (document.getElementById('mpc-alpha1') || {}).value || '';
    p2 = (document.getElementById('mpc-alpha2') || {}).value || '';
    if (p1.length < 4) {
      if (err) err.textContent = 'Passcode must be at least 4 characters.'; return;
    }
  }
  if (p1 !== p2) {
    if (err) err.textContent = 'Passcodes do not match. Try again.';
    if (type === 'pin') {
      var pin2 = document.getElementById('mpc-pin2'); if (pin2) { pin2.value = ''; pin2.focus(); }
    } else {
      var a2 = document.getElementById('mpc-alpha2'); if (a2) { a2.value = ''; a2.focus(); }
    }
    return;
  }
  vpcSave(p1, type);
  closeM('m-passcode-setup');
  // Clear fields
  ['mpc-pin1','mpc-pin2','mpc-alpha1','mpc-alpha2'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  toast('Vault passcode set. Vault is now protected.', 'success');
  updateSettingsPasscodeUI();
}

function mpcSkip() {
  closeM('m-passcode-setup');
  toast('No passcode set. You can add one in Settings anytime.', 'success');
}

// ── SETTINGS: CHANGE / REMOVE PASSCODE ───────────────────────
function openChangePasscode() {
  if (vpcIsSet()) {
    // Verify current passcode first via lock screen style prompt
    var current = prompt('Enter your current vault passcode to continue:');
    if (current === null) return;
    if (!vpcVerify(current)) { toast('Incorrect current passcode.', 'error'); return; }
  }
  // Reset setup modal
  ['mpc-pin1','mpc-pin2','mpc-alpha1','mpc-alpha2'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  var err = document.getElementById('mpc-err'); if (err) err.textContent = '';
  mpcSetTab('pin');
  var title = document.getElementById('mpc-title');
  var sub   = document.getElementById('mpc-sub');
  if (title) title.textContent = vpcIsSet() ? '🔑 Change Vault Passcode' : '🔒 Set Vault Passcode';
  if (sub)   sub.textContent   = 'Choose a new passcode to protect your vault.';
  openM('m-passcode-setup');
}

function removePasscode() {
  if (!vpcIsSet()) { toast('No passcode is currently set.', 'error'); return; }
  var current = prompt('Enter your current vault passcode to confirm removal:');
  if (current === null) return;
  if (!vpcVerify(current)) { toast('Incorrect passcode.', 'error'); return; }
  if (!confirm('Remove vault passcode? Anyone with access to this USB drive will be able to open your vault without a PIN.')) return;
  vpcRemove();
  localStorage.removeItem('tv_vpc_offered');
  toast('Vault passcode removed.', 'success');
  updateSettingsPasscodeUI();
}

function saveIdleLock() {
  var sel = document.getElementById('vpc-idle-sel');
  if (!sel) return;
  localStorage.setItem(VPC_IDLE, sel.value);
  toast('Auto-lock setting saved.', 'success');
}

function updateSettingsPasscodeUI() {
  var status = document.getElementById('vpc-status');
  var type   = document.getElementById('vpc-type-badge');
  var idleSel= document.getElementById('vpc-idle-sel');
  var removeBtn = document.getElementById('vpc-remove-btn');
  if (vpcIsSet()) {
    if (status) { status.textContent = 'Protected'; status.style.color = 'var(--ok)'; }
    if (type)   { type.textContent = vpcGetType() === 'pin' ? '4-Digit PIN' : 'Custom Passcode'; type.style.display = 'inline'; }
    if (idleSel) idleSel.disabled = false;
    if (removeBtn) removeBtn.style.display = 'inline-flex';
  } else {
    if (status) { status.textContent = 'Not Set'; status.style.color = 'var(--muted)'; }
    if (type)   type.style.display = 'none';
    if (idleSel) idleSel.disabled = false;
    if (removeBtn) removeBtn.style.display = 'none';
  }
  // Restore idle setting
  if (idleSel) {
    var saved = localStorage.getItem(VPC_IDLE) || '5';
    idleSel.value = saved;
  }
}

// ── MANUAL LOCK ──────────────────────────────────────────────
function lockVaultNow() {
  if (!vpcIsSet()) {
    toast('Set a vault passcode first in Settings.', 'error'); return;
  }
  vpcLockApp();
}

// ── INIT CALL ────────────────────────────────────────────────
function initVaultPasscode() {
  updateSettingsPasscodeUI();
  vpcStartIdleWatcher();
}

initVaultPasscode();
