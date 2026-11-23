/**
 * 可复现随机数（简易版 seed 随机）
 * 世界生成、价格波动、战斗判定都走这里，保证同一存档读档后行为一致。
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class RNG {
  constructor(seed) {
    this.seed = (seed >>> 0) || 1;
    this.next = mulberry32(this.seed);
  }

  /** 0 ~ 1 */
  random() {
    return this.next();
  }

  /** 闭区间整数 */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min, max) {
    return min + this.next() * (max - min);
  }

  chance(p) {
    return this.next() < p;
  }

  pick(list) {
    if (!list || !list.length) return null;
    return list[Math.floor(this.next() * list.length)];
  }

  /** 原地洗牌 */
  shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }
}

module.exports = { RNG, mulberry32 };
