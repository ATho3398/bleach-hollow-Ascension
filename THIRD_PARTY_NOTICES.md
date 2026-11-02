# 서드파티 고지 (Third-party notices)

이 게임에 들어가는 외부 저작물과 라이선스. 새 외부 저작물을 넣으면 여기에 적는다.

## pixelfx

- 출처: https://github.com/patch-gg/pixelfx — 버전 0.3.0, 커밋 a84159688af3ca37a4be05a0d422b94451b2e24e (`scripts/pixelfx/pin.json`)
- 쓰는 곳: `public/fx/` 의 픽셀 이펙트 스프라이트 시트(pixelfx 로 렌더), `.claude/skills/pixelfx/` (개발용 Claude Code 스킬). 게임 코드에는 pixelfx 코드가 들어가지 않는다.
- 배포본에는 `public/fx/LICENSE-pixelfx.txt` 로 같은 고지가 함께 나간다.
- **Patch Pixel 글꼴**(pixelfx `gallery/fonts`)은 MIT 가 아니라 쓰지 않는다.

```
MIT License

Copyright (c) 2026 Patch
Copyright (c) 2026 Hugo Duprez

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

pixelfx NOTICE.md:

> # Notices
> 
> **Hugo Duprez.** `src/core/sim.js` and the effects that say so at the top of their file adapt Sprite Fusion's
> open-source pixel art VFX (https://www.spritefusion.com/pixel-art-vfx), Copyright (c) 2026 Hugo Duprez, MIT License.
> 
> **Hollow Crown.** `src/core/act.js` adapts how Hollow Crown plays its skills (poses on 12 fps steps, hit-stops, the springy
> straw target), from
> https://github.com/rehan-remade/hollow-crown, Copyright (c) 2026 rehan-remade, MIT License.
> 
> **Patch Pixel.** The font in `gallery/fonts` is Patch's own and is not covered by this repository's MIT license. See
> `gallery/fonts/NOTICE.md`.
