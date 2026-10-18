/* ==========================================================================
   kit.js — 반복되는 컴포넌트의 "DOM 생성 참고 구현" (데모용, 문자열 버전)
   실제 앱의 el(tag, className, text) 헬퍼로 옮길 때 이 구조를 그대로 따르면 된다.
   ========================================================================== */
(function () {
  function icon(id, cls) { return '<svg class="bha-icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#' + id + '"/></svg>'; }
  var ROLE_ICON = { attack: 'i-attack', guard: 'i-guard', heal: 'i-heal', basic: 'i-basic', special: 'i-special', void: 'i-void' };

  /* 블록
     data: { kind:'attack'|'guard'|'heal'|'basic'|'special'|'void', abbr:'찢는 발톱', chain:1|2|3, weak:bool, state:'is-pressed ...' } */
  function block(d) {
    var cls = 'bha-block bha-block--' + d.kind;
    if (d.chain === 2) cls += ' is-chain2';
    if (d.chain === 3) cls += ' is-chain3';
    if (d.weak) cls += ' is-weak';
    if (d.state) cls += ' ' + d.state;
    var skill = d.kind === 'attack' || d.kind === 'guard' || d.kind === 'heal';
    return '<div class="' + cls + '"' + (d.style ? ' style="' + d.style + '"' : '') + ' role="button" tabindex="0" aria-label="' + (d.label || d.abbr) + '">' +
      (skill ? '<span class="bha-block__pips"><i></i><i></i><i></i></span>' : '') +
      '<span class="bha-block__icon">' + icon(ROLE_ICON[d.kind]) + '</span>' +
      '<b class="bha-block__abbr"' + (d.sp ? ' data-sp="' + d.sp + '"' : '') + '>' + d.abbr + '</b>' +
      '<span class="bha-block__weak">' + icon('i-weak') + '</span></div>';
  }

  /* 블록 바
     cells: 길이 8 배열 (블록 data 또는 null), runs: [[start,len],...], opt: { insertAt, origin, sealText } */
  function tray(cells, runs, opt) {
    opt = opt || {};
    var h = '<div class="bha-tray__grid">';
    for (var i = 0; i < 8; i++) {
      var c = cells[i];
      h += '<div class="bha-tray__cell' + (opt.origin === i + 1 ? ' is-origin' : '') + '">' + (c ? block(c) : '') + '</div>';
    }
    (runs || []).forEach(function (r) {
      h += '<div class="bha-tray__run' + (r[1] === 3 ? ' bha-tray__run--chain3' : '') + (r[2] ? ' ' + r[2] : '') + '" style="--start:' + r[0] + ';--len:' + r[1] + '"><span class="bha-tray__runlabel">' + icon('i-chain-' + r[1]) + '체인' + r[1] + '</span></div>';
    });
    if (opt.insertAt) h += '<i class="bha-tray__insert' + (opt.insertAt === 9 ? ' bha-tray__insert--end' : '') + '" style="--at:' + Math.min(opt.insertAt, 8) + '"></i>';
    h += '</div><div class="bha-tray__veil">' + icon('i-seal') + (opt.sealText || '봉인 — 블록 생성 정지') + '</div>';
    return h;
  }

  /* 상태 바
     d: { mod:'hunger', label:'허기', icon:'i-hunger', value:20, max:100, zone:0.8, ghost, note, danger, compact, lg, sp:'risk' } */
  function meter(d) {
    var cls = 'bha-meter bha-meter--' + d.mod + (d.compact ? ' bha-meter--compact' : '') + (d.lg ? ' bha-meter--lg' : '') + (d.thin ? ' bha-meter--thin' : '') + (d.danger ? ' is-danger' : '') + (d.full ? ' is-full' : '');
    var fill = Math.max(0, Math.min(1, d.value / d.max));
    return '<div class="' + cls + '" style="--fill:' + fill.toFixed(3) + (d.ghost != null ? ';--ghost:' + d.ghost : '') + '" role="meter" aria-valuemin="0" aria-valuemax="' + d.max + '" aria-valuenow="' + d.value + '" aria-label="' + d.label + '">' +
      '<div class="bha-meter__head"><span class="bha-meter__label">' + (d.icon ? icon(d.icon) : '') + '<span' + (d.sp ? ' data-sp="' + d.sp + '"' : '') + (d.spTpl ? ' data-sp-tpl="' + d.spTpl + '"' : '') + '>' + d.label + '</span></span><span class="bha-meter__value">' + d.value + '<small> / ' + d.max + '</small></span></div>' +
      '<div class="bha-meter__track">' + (d.ghost != null ? '<i class="bha-meter__ghost"></i>' : '') + '<i class="bha-meter__fill"></i>' + (d.zone != null ? '<i class="bha-meter__zone" style="--zone:' + d.zone + '"></i>' : '') + '</div>' +
      (d.note ? '<p class="bha-meter__note">' + icon('i-warn') + d.note + '</p>' : '') + '</div>';
  }

  window.bhaKit = { icon: icon, block: block, tray: tray, meter: meter };
})();
