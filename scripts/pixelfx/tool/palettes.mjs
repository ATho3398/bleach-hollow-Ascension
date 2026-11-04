// 속성 색 팔레트 (이펙트 배치 도구와 게임 시트가 같이 쓴다, GDD 이펙트 장): 어두움 → 밝음.
// 사용자 2026-11-04 "흰색, 물, 불, 흙, 번개, 독, 피, 보라색" — 노멀 = 흰색, 뇌 = 노란 번개, 혈 = 피, 허 = 보라
export const PALETTES = {
  normal: ['#3a3e48', '#6a707e', '#9aa0ae', '#c4c8d2', '#e2e6ee', '#f4f6fa', '#ffffff'],
  water: ['#0e2e5a', '#14508c', '#1c76bc', '#36a2e0', '#78ccf4', '#c4ecff', '#ffffff'],
  fire: ['#4a1118', '#8c1d1c', '#cc3a1a', '#f2701f', '#ffae35', '#ffe27a', '#fff8d6'],
  earth: ['#2a1e14', '#47321e', '#69492a', '#8e6638', '#b88a52', '#dcb47c', '#f6e6c4'],
  thunder: ['#5e3a0c', '#a8680f', '#e8a218', '#ffd23c', '#fff08a', '#fffbd0', '#ffffff'],
  poison: ['#173a14', '#265e18', '#3f8a1e', '#6cb82a', '#a8e04a', '#e0ff8a', '#f6ffd8'],
  blood: ['#3a0a14', '#6a101c', '#a01824', '#d42a30', '#ff5a50', '#ff9a8a', '#ffe0da'],
  kyo: ['#2b1252', '#481c88', '#6b2cc0', '#9a48ec', '#c684ff', '#ecc8ff', '#ffffff'],
};
// 속성 색일 때 이펙트별 테두리 색 (02:5x "세로랑 세로 오스큐라스 노멀 테두리색은 어두운 검정으로 하자.")
export const EDGES = { normal: { 'custom/cero': '#0c0c10', 'custom/cero-oscuras': '#0c0c10' } };
/** 게임 시트 이름 (src/ui/bha/pixelFx.ts fxSheetName 과 같은 규칙): pixelfx id 의 / → -, 속성 색이면 뒤에 -<속성 id> */
export const sheetName = (id, el) => `${id.replace('/', '-')}${el ? `-${el}` : ''}`;
