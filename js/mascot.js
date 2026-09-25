// マスコット「すみまる」（墨のしずくの妖精）
const EYES = {
  normal: `<ellipse cx="78" cy="112" rx="7" ry="9" fill="#fff"/><ellipse cx="122" cy="112" rx="7" ry="9" fill="#fff"/>
           <circle cx="80" cy="114" r="4" fill="#1b1a1f"/><circle cx="124" cy="114" r="4" fill="#1b1a1f"/>
           <circle cx="81.5" cy="111" r="1.6" fill="#fff"/><circle cx="125.5" cy="111" r="1.6" fill="#fff"/>`,
  happy: `<path d="M70 114 q8 -10 16 0" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round"/>
          <path d="M114 114 q8 -10 16 0" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round"/>`,
  sad: `<path d="M70 110 q8 6 16 2" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M114 112 q8 4 16 -2" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path class="tear" d="M78 120 q-5 9 0 12 q5 -3 0 -12z" fill="#8fd3ff"/>`,
  think: `<ellipse cx="78" cy="112" rx="7" ry="8" fill="#fff"/><ellipse cx="122" cy="112" rx="7" ry="8" fill="#fff"/>
          <circle cx="82" cy="109" r="4" fill="#1b1a1f"/><circle cx="126" cy="109" r="4" fill="#1b1a1f"/>`,
};
const MOUTH = {
  normal: '<path d="M92 132 q8 8 16 0" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
  happy: '<path d="M88 128 q12 18 24 0 z" fill="#ff8a8a" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>',
  sad: '<path d="M92 138 q8 -7 16 0" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
  think: '<path d="M94 134 h12" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>',
};

export function mascot(mood = 'normal', cls = '') {
  const m = EYES[mood] ? mood : 'normal';
  const cheer = mood === 'cheer' || mood === 'happy';
  return `
<svg class="mascot ${cls} mood-${mood}" viewBox="0 0 200 200" aria-hidden="true">
  <defs>
    <radialGradient id="sm-body" cx="0.38" cy="0.35" r="0.75">
      <stop offset="0" stop-color="#4a4a58"/><stop offset="0.6" stop-color="#26252e"/><stop offset="1" stop-color="#121117"/>
    </radialGradient>
  </defs>
  <ellipse cx="100" cy="186" rx="46" ry="7" fill="rgba(0,0,0,.12)"/>
  <g class="mascot-body">
    <path d="M100 18 C 112 46, 160 82, 160 126 C 160 162, 132 182, 100 182 C 68 182, 40 162, 40 126 C 40 82, 88 46, 100 18 Z" fill="url(#sm-body)"/>
    <path d="M70 70 C 62 84, 56 98, 56 110" stroke="rgba(255,255,255,.28)" stroke-width="6" fill="none" stroke-linecap="round"/>
    <!-- はちまき -->
    <path d="M47 92 C 80 80, 120 80, 153 92 L 156 104 C 120 93, 80 93, 44 104 Z" fill="#fff"/>
    <circle cx="100" cy="92" r="9" fill="#d9442e"/>
    <path d="M150 96 C 164 88, 174 92, 180 84 M150 100 C 164 104, 172 110, 182 106" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/>
    <ellipse cx="66" cy="132" rx="9" ry="5" fill="#ff8fa3" opacity=".55"/>
    <ellipse cx="134" cy="132" rx="9" ry="5" fill="#ff8fa3" opacity=".55"/>
    ${EYES[m]}
    ${MOUTH[m] || MOUTH.normal}
    ${cheer ? `<path class="arm-l" d="M44 138 C 30 128, 24 116, 22 104" stroke="#26252e" stroke-width="10" fill="none" stroke-linecap="round"/>
               <path class="arm-r" d="M156 138 C 170 128, 176 116, 178 104" stroke="#26252e" stroke-width="10" fill="none" stroke-linecap="round"/>`
             : `<path d="M46 146 C 36 150, 32 158, 34 164" stroke="#26252e" stroke-width="10" fill="none" stroke-linecap="round"/>
               <path d="M154 146 C 164 150, 168 158, 166 164" stroke="#26252e" stroke-width="10" fill="none" stroke-linecap="round"/>`}
  </g>
</svg>`;
}

const LINES = {
  morning: ['おはよう！朝の頭はよく覚えるよ', '朝の5分がきいてくるよ！'],
  day: ['今日もいっしょにがんばろう！', 'コツコツが合格への近道だよ', '苦手な問題ほど、覚えたときうれしいね'],
  evening: ['おつかれさま！少しだけやっていこう', '寝る前の復習は記憶に残りやすいよ'],
  due: (n) => `復習どきの問題が${n}問あるよ。忘れる前にやっつけよう！`,
  streak: (n) => `${n}日連続！すごいね、その調子！`,
  exam: (d) => `本番まであと${d}日。いっしょに合格しよう！`,
};

export function greeting({ due = 0, streak = 0, examDays = null } = {}) {
  const h = new Date().getHours();
  const opts = [];
  if (due >= 5) opts.push(LINES.due(due));
  if (streak >= 2) opts.push(LINES.streak(streak));
  if (examDays != null && examDays >= 0 && examDays <= 60) opts.push(LINES.exam(examDays));
  opts.push(...(h < 10 ? LINES.morning : h >= 18 ? LINES.evening : LINES.day));
  return opts[Math.floor(Math.random() * Math.min(opts.length, 3))];
}
