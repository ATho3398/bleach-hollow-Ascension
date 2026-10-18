// 아이콘 스프라이트 (HANDOFF 2-2): 앱 시작 때 <body> 맨 앞에 인라인으로 한 번 꽂는다.
import spriteSvg from './sprite.svg?raw';

export function mountSprite(doc: Document = document): void {
  if (doc.getElementById('i-attack')) return;
  const holder = doc.createElement('div');
  holder.hidden = true;
  holder.setAttribute('aria-hidden', 'true');
  holder.innerHTML = spriteSvg;
  doc.body.prepend(holder);
}
