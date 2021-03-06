var jit = require('../../jit'),
    util = require('util');

module.exports = Asm;
function Asm(arch, options) {
  jit.BaseAsm.call(this, arch, options);

  // General purpose registers
  this.gp = {
    rax: 0, rcx: 1, rdx: 2, rbx: 3,
    rsp: 4, rbp: 5, rsi: 6, rdi: 7,
    r8: 8, r9: 9, r10: 10, r11: 11,
    r12: 12, r13: 13, r14: 14, r15: 15
  };

  // XMM
  this.xmm = {
    xmm0: 0, xmm1: 1, xmm2: 2, xmm3: 3,
    xmm4: 4, xmm5: 5, xmm6: 6, xmm7: 7,
    xmm8: 8, xmm9: 9, xmm10: 10, xmm11: 11,
    xmm12: 12, xmm13: 13, xmm14: 14, xmm15: 15
  };
};
util.inherits(Asm, jit.BaseAsm);

Asm.prototype.getHigh = function getHigh(src) {
  // Operand ([reg, offset])
  if (Array.isArray(src)) {
    assert.equal(src.length, 2);
    return this.getHigh(src[0]);

  // Register ('rax')
  } else if (typeof src === 'string') {
    return (this.getIndex(src) >> 3) & 1;
  } else {
    throw new Error('getHigh(immediate) is not supported');
  }
};

Asm.prototype.getLow = function getLow(src) {
  // Operand ([reg, offset])
  if (Array.isArray(src)) {
    assert.equal(src.length, 2);
    return this.getLow(src[0]);

  // Register ('rax')
  } else if (typeof src === 'string') {
    return this.getIndex(src) & 0x7;
  } else {
    throw new Error('getLow(immediate) is not supported');
  }
};

Asm.prototype.getIndex = function getIndex(src) {
  if (this.gp.hasOwnProperty(src)) {
    return this.gp[src];
  } else if (this.xmm.hasOwnProperty(src)) {
    return this.xmm[src];
  } else {
    throw new Error(src + ' not found');
  }
};

// Emit rex.w prefix
Asm.prototype.rexw = function rexw(src, dst) {
  // rex.w
  var byte = 0x48;

  // rex.r
  if (dst) byte |= this.getHigh(dst) << 2;

  // rex.b
  if (src) byte |= this.getHigh(src);

  this.emitb(byte);
};

// Emit rex.w prefix only if operands have high bits
Asm.prototype.optrexw = function optrexw(src, dst) {
  if (dst && this.getHigh(dst) || src && this.getHigh(src)) {
    this.rexw(src, dst);
  }
};

// Emit modrm byte
Asm.prototype.modrm = function modrm(src, dst) {
  var mod = 0,
      rm = 0,
      reg = 0,
      payload = 0,
      payloadWidth = 0;

  if (Array.isArray(dst)) {
    assert(dst.length >= 1);

    // [reg]
    if (dst.length === 1) {
      mod = 0;
    } else if (dst.length >= 2) {
      var offset = dst[1];

      assert.equal(typeof offset, 'number');
      if (-0x7f <= offset && offset <= 0x7f) {
        // [reg]+disp8
        mod = 1;
        payload = offset;
        payloadWidth = 1;
      } else {
        // [reg]+disp32
        mod = 2;
        payload = offset;
        payloadWidth = 4;
      }
    }
  } else if (dst) {
    // reg
    mod = 3;
    rm = this.getIndex(dst);
  }

  if (src) reg = typeof src === 'string' ? this.getIndex(src) : src;

  this.emitb((mod << 6) | (reg << 3) | rm);

  if (payloadWidth === 1) {
    this.emitb(payload);
  } else if (payloadWidth === 4) {
    this.emitl(payload >>> 0);
  }
};

Asm.prototype.push = function push(src) {
  if (typeof src === 'string') {
    // push reg
    this.rexw(src);
    this.emitb(0x50 | this.getLow(src));
  } else if (Array.isArray(src)) {
    // push [mem]
    this.rexw(src);
    this.emitb(0xff);
    this.modrm(6, src);
  } else {
    if (typeof src === 'number') {
      if (-0x7f >= src && src <= 0x7f) {
        // push imm8
        this.emitb(0x6a);
        this.emitb(src >>> 0);
      } else {
        // push imm32
        this.emitb(0x68);
        this.emitl(src >>> 0);
      }
    } else {
      assert(Buffer.isBuffer(src));
      assert.equal(src.length, 4);
      // push imm32
      this.emitb(0x68);
      this.emitl(src);
    }
  }
};

Asm.prototype.pop = function pop(dst) {
  if (typeof dst === 'string') {
    // push reg
    this.rexw(dst);
    this.emitb(0x58 | this.getLow(dst));
  } else {
    assert(Array.isArray(dst));
    // push [mem]
    this.rexw(dst);
    this.emitb(0x8f);
    this.modrm(6, dst);
  }
};

Asm.prototype.movq = function mov(src, dst) {
  if (typeof src === 'string' && typeof dst === 'string') {
    this.rexw(src, dst);
    this.emitb(0x89);
    this.modrm(src, dst);
  } else if (typeof src === 'number') {
    this.rexw(dst);
    this.emitb(0xc7);
    this.modrm(0, dst);
    this.emitl(src);
  } else if (Buffer.isBuffer(src)) {
    this.rexw(dst);
    this.emitb(0xb8 | this.getLow(dst));
    this.emitq(src);
  }
};

Asm.prototype.ret = function ret(count) {
  if (!count) {
    this.emitb(0xc3);
  } else {
    this.emitb(0xc2);
    this.emitw(count);
  }
};
