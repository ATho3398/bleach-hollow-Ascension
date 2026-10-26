// 종족 테마 CSS 자동 수집 (C.139, GDD 88장 14): theme-*.css 를 파일 이름 순으로 넣는다(맨 앞 테마가 :root 기본값을 겸한다).
// main.ts 에서 tokens.css 바로 뒤에 import 해 CSS 순서(토큰 → 테마 → 기본)를 지킨다
import.meta.glob('./theme-*.css', { eager: true });
