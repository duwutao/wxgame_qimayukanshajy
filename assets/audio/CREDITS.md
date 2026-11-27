# 场景音乐来源与授权

游戏内 7 个场景音乐位（城镇、队伍与商店复用标题曲），所用 6 首录音全部来自 OpenGameArt.org，授权均为 **CC0 1.0 Universal（公共领域）**：
可商用、可修改、可再分发，不要求署名。下面仍保留作者与来源，便于核对。

| 游戏内文件 | 用途 | 原曲 | 作者 | 来源 | 授权 |
| --- | --- | --- | --- | --- | --- |
| title_hanmo.mp3 | 标题 / 开局 / 城镇 / 队伍 / 商店 | Asianoriental2 | Tozan | https://opengameart.org/content/asianoriental2 | CC0 |
| field_xingjun.mp3 | 大地图行军 | Medieval: Exploration | RandomMind | https://opengameart.org/content/medieval-exploration | CC0 |
| battle_zhangu.mp3 | 战斗 | Medieval: Battle | RandomMind | https://opengameart.org/content/medieval-battle | CC0 |
| tense_duizhi.mp3 | 宣战 / 围城 / 对峙 | Medieval Standoff | Umplix | https://opengameart.org/content/medieval-standoff | CC0 |
| sorrow_guoshang.mp3 | 败亡 / 国殇 | Medieval: Defeat Theme | RandomMind | https://opengameart.org/content/medieval-defeat-theme | CC0 |
| victory_kaixuan.mp3 | 凯旋 / 庆功 | Medieval: Victory Theme | RandomMind | https://opengameart.org/content/medieval-victory-theme | CC0 |

## 处理说明

为适配小游戏首包体积，原始文件做了以下无损/有损处理：

- 截取 22–36 秒的高潮或可循环片段；
- 首尾各加 0.5–1 秒淡入淡出，避免切歌爆音；
- 转为单声道 MP3，32–40 kbps（背景音乐音量约 0.32，主要起氛围铺垫作用）。

城镇、队伍与商店不再使用旧版市集录音，改播标题曲《Asianoriental2》的安静段落；
音量仍按场景统一压低，避免市集录音过响、过密的问题。原曲仍是 CC0，可商用。

如果后续要换成更高音质，只需覆盖 `assets/audio/` 下的同名文件，`js/core/audio.js` 会自动加载；
文件缺失或加载失败时会回落到原有的 WebAudio 程序化音乐，不会静音卡死。

## 授权原文

CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/
