/*
  (c) 2012-2021 Noora Halme et al. (see AUTHORS)
  (c) 2022 Alasdair McLeay

  This code is licensed under the MIT license:
  http://www.opensource.org/licenses/mit-license.php

  Protracker module player class

  todo:
  - pattern looping is broken (see mod.black_queen)
  - properly test EEx delay pattern
*/

// constructor for protracker player object
export class Protracker {
  playing: boolean;
  paused: boolean;
  repeat: boolean;
  filter: boolean;
  mixval: number;
  syncqueue: number[];
  samplerate: number;
  baseperiodtable: Float32Array;
  finetunetable: Float32Array;
  vibratotable: Float32Array[];

  title?: string;
  signature?: string;
  songlen = 0;
  repeatpos?: number;
  patterntable: Float32Array = new Float32Array(0);
  channels = 0;
  sample: {
    name: string;
    length: number;
    finetune: number;
    volume: number;
    loopstart: number;
    looplength: number;
    data: Float32Array;
  }[] = [];
  samples = 0;
  patterns = 0;
  pattern: Uint8Array[] = [];
  note?: Uint8Array[];
  pattern_unpack?: Uint8Array[];
  looprow = 0;
  loopstart?: number;
  loopcount?: number;
  patterndelay?: number;
  patternwait = 0;

  // used first in intialize
  tick = 0;
  position = 0;
  row = 0;
  offset = 0;
  flags = 0;
  speed = 0;
  bpm = 0;
  breakrow = 0;
  patternjump = 0;
  endofsong?: boolean;
  channel: {
    sample: number;
    period: number;
    voiceperiod: number;
    note: number;
    volume: number;
    command: number;
    data: number;
    samplepos: number;
    samplespeed: number;
    flags: number;
    noteon: number;
    slidespeed: number;
    slideto: number;
    slidetospeed: number;
    arpeggio: number;
    semitone: number;
    vibratospeed: number;
    vibratodepth: number;
    vibratopos: number;
    vibratowave: number;
  }[] = [];

  // used first in parse
  chvu: Float32Array = new Float32Array(0);

  constructor() {
    let t;

    this.clearsong();
    this.initialize();

    this.playing = false;
    this.paused = false;
    this.repeat = false;

    this.filter = false;

    this.mixval = 4.0;

    this.syncqueue = [];

    this.samplerate = 44100;

    // paula period values
    this.baseperiodtable = new Float32Array([
      856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453, 428, 404, 381,
      360, 339, 320, 302, 285, 269, 254, 240, 226, 214, 202, 190, 180, 170, 160,
      151, 143, 135, 127, 120, 113,
    ]);

    // finetune multipliers
    this.finetunetable = new Float32Array(16);
    for (t = 0; t < 16; t++)
      this.finetunetable[t] = Math.pow(2, (t - 8) / 12 / 8);

    // calc tables for vibrato waveforms
    this.vibratotable = [];
    for (t = 0; t < 4; t++) {
      this.vibratotable[t] = new Float32Array(64);
      for (let i = 0; i < 64; i++) {
        switch (t) {
          case 0:
            this.vibratotable[t][i] = 127 * Math.sin(Math.PI * 2 * (i / 64));
            break;
          case 1:
            this.vibratotable[t][i] = 127 - 4 * i;
            break;
          case 2:
            this.vibratotable[t][i] = i < 32 ? 127 : -127;
            break;
          case 3:
            this.vibratotable[t][i] = (1 - 2 * Math.random()) * 127;
            break;
        }
      }
    }
  }

  // clear song data
  clearsong() {
    this.title = "";
    this.signature = "";

    this.songlen = 1;
    this.repeatpos = 0;
    this.patterntable = new Float32Array(128);
    for (let i = 0; i < 128; i++) this.patterntable[i] = 0;

    this.channels = 4;

    this.sample = [];
    this.samples = 31;
    for (let i = 0; i < 31; i++) {
      this.sample[i] = {
        name: "",
        length: 0,
        finetune: 0,
        volume: 64,
        loopstart: 0,
        looplength: 0,
        data: new Float32Array(0),
      };
    }

    this.patterns = 0;
    this.pattern = [];
    this.note = [];
    this.pattern_unpack = [];

    this.looprow = 0;
    this.loopstart = 0;
    this.loopcount = 0;

    this.patterndelay = 0;
    this.patternwait = 0;
  }

  // initialize all player variables
  initialize() {
    this.syncqueue = [];

    this.tick = 0;
    this.position = 0;
    this.row = 0;
    this.offset = 0;
    this.flags = 0;

    this.speed = 6;
    this.bpm = 125;
    this.breakrow = 0;
    this.patternjump = 0;
    this.patterndelay = 0;
    this.patternwait = 0;
    this.endofsong = false;

    this.channel = [];
    for (let i = 0; i < this.channels; i++) {
      this.channel[i] = {
        sample: 0,
        period: 214,
        voiceperiod: 214,
        note: 24,
        volume: 64,
        command: 0,
        data: 0,
        samplepos: 0,
        samplespeed: 0,
        flags: 0,
        noteon: 0,
        slidespeed: 0,
        slideto: 214,
        slidetospeed: 0,
        arpeggio: 0,
        semitone: 12,
        vibratospeed: 0,
        vibratodepth: 0,
        vibratopos: 0,
        vibratowave: 0,
      };
    }
  }

  // parse the module from local buffer
  parse(buffer: Uint8Array) {
    let i, j, c;

    for (i = 0; i < 4; i++)
      this.signature += String.fromCharCode(buffer[1080 + i]);
    switch (this.signature) {
      case "M.K.":
      case "M!K!":
      case "4CHN":
      case "FLT4":
        break;

      case "6CHN":
        this.channels = 6;
        break;

      case "8CHN":
      case "FLT8":
        this.channels = 8;
        break;

      case "28CH":
        this.channels = 28;
        break;

      default:
        return false;
    }
    this.chvu = new Float32Array();
    for (let i = 0; i < this.channels; i++) this.chvu[i] = 0.0;

    i = 0;
    while (buffer[i] && i < 20)
      this.title = this.title + String.fromCharCode(buffer[i++]);

    for (let i = 0; i < this.samples; i++) {
      const st = 20 + i * 30;
      j = 0;
      while (buffer[st + j] && j < 22) {
        this.sample[i].name +=
          buffer[st + j] > 0x1f && buffer[st + j] < 0x7f
            ? String.fromCharCode(buffer[st + j])
            : " ";
        j++;
      }
      this.sample[i].length = 2 * (buffer[st + 22] * 256 + buffer[st + 23]);
      this.sample[i].finetune = buffer[st + 24];
      if (this.sample[i].finetune > 7)
        this.sample[i].finetune = this.sample[i].finetune - 16;
      this.sample[i].volume = buffer[st + 25];
      this.sample[i].loopstart = 2 * (buffer[st + 26] * 256 + buffer[st + 27]);
      this.sample[i].looplength = 2 * (buffer[st + 28] * 256 + buffer[st + 29]);
      if (this.sample[i].looplength == 2) this.sample[i].looplength = 0;
      if (this.sample[i].loopstart > this.sample[i].length) {
        this.sample[i].loopstart = 0;
        this.sample[i].looplength = 0;
      }
    }

    this.songlen = buffer[950];
    if (buffer[951] != 127) this.repeatpos = buffer[951];
    for (let i = 0; i < 128; i++) {
      this.patterntable[i] = buffer[952 + i];
      if (this.patterntable[i] > this.patterns)
        this.patterns = this.patterntable[i];
    }
    this.patterns += 1;
    const patlen = 4 * 64 * this.channels;

    this.pattern = [];
    this.note = [];
    this.pattern_unpack = [];
    for (let i = 0; i < this.patterns; i++) {
      this.pattern[i] = new Uint8Array(patlen);
      this.note[i] = new Uint8Array(this.channels * 64);
      this.pattern_unpack[i] = new Uint8Array(this.channels * 64 * 5);
      for (j = 0; j < patlen; j++)
        this.pattern[i][j] = buffer[1084 + i * patlen + j];
      for (j = 0; j < 64; j++)
        for (c = 0; c < this.channels; c++) {
          this.note[i][j * this.channels + c] = 0;
          const n =
            ((this.pattern[i][j * 4 * this.channels + c * 4] & 0x0f) << 8) |
            this.pattern[i][j * 4 * this.channels + c * 4 + 1];
          for (let np = 0; np < this.baseperiodtable.length; np++)
            if (n == this.baseperiodtable[np])
              this.note[i][j * this.channels + c] = np;
        }
      for (j = 0; j < 64; j++) {
        for (c = 0; c < this.channels; c++) {
          const pp = j * 4 * this.channels + c * 4;
          const ppu = j * 5 * this.channels + c * 5;
          let n = ((this.pattern[i][pp] & 0x0f) << 8) | this.pattern[i][pp + 1];
          if (n) {
            n = this.note[i][j * this.channels + c];
            n = n % 12 | ((Math.floor(n / 12) + 2) << 4);
          }
          this.pattern_unpack[i][ppu + 0] = n ? n : 255;
          this.pattern_unpack[i][ppu + 1] =
            (this.pattern[i][pp + 0] & 0xf0) | (this.pattern[i][pp + 2] >> 4);
          this.pattern_unpack[i][ppu + 2] = 255;
          this.pattern_unpack[i][ppu + 3] = this.pattern[i][pp + 2] & 0x0f;
          this.pattern_unpack[i][ppu + 4] = this.pattern[i][pp + 3];
        }
      }
    }

    let sst = 1084 + this.patterns * patlen;
    for (let i = 0; i < this.samples; i++) {
      this.sample[i].data = new Float32Array(this.sample[i].length);
      for (j = 0; j < this.sample[i].length; j++) {
        let q = buffer[sst + j];
        if (q < 128) {
          q = q / 128.0;
        } else {
          q = (q - 128) / 128.0 - 1.0;
        }
        this.sample[i].data[j] = q;
      }
      sst += this.sample[i].length;
    }

    // look ahead at very first row to see if filter gets enabled
    this.filter = false;
    for (let ch = 0; ch < this.channels; ch++) {
      const p = this.patterntable[0];
      const pp = ch * 4;
      const cmd = this.pattern[p][pp + 2] & 0x0f,
        data = this.pattern[p][pp + 3];
      if (cmd == 0x0e && (data & 0xf0) == 0x00) {
        if (!(data & 0x01)) {
          this.filter = true;
        } else {
          this.filter = false;
        }
      }
    }

    // TODO: set lowpass cutoff
    // if (this.context) {
    //   if (this.filter) {
    //     this.lowpassNode.frequency.value = 3275;
    //   } else {
    //     this.lowpassNode.frequency.value = 28867;
    //   }
    // }

    this.chvu = new Float32Array(this.channels);
    for (let i = 0; i < this.channels; i++) this.chvu[i] = 0.0;

    return true;
  }

  mix(bufs: Float32Array[], buflen: number) {
    return mix(this, bufs, buflen);
  }
  advance() {
    return advance(this);
  }

  play() {
    this.playing = true;
    this.paused = false;
  }

  pause() {
    this.playing = false;
    this.paused = true;
  }
}
// advance player
function advance(mod: Protracker) {
  const spd = (mod.samplerate * 60) / mod.bpm / 4 / 6;

  // advance player
  if (mod.offset > spd) {
    mod.tick++;
    mod.offset = 0;
    mod.flags |= 1;
  }
  if (mod.tick >= mod.speed) {
    if (mod.patterndelay) {
      // delay pattern
      if (mod.tick < (mod.patternwait + 1) * mod.speed) {
        mod.patternwait++;
      } else {
        mod.row++;
        mod.tick = 0;
        mod.flags |= 2;
        mod.patterndelay = 0;
      }
    } else {
      if (mod.flags & (16 + 32 + 64)) {
        if (mod.flags & 64) {
          // loop pattern?
          mod.row = mod.looprow;
          mod.flags &= 0xa1;
          mod.flags |= 2;
        } else {
          if (mod.flags & 16) {
            // pattern jump/break?
            mod.position = mod.patternjump;
            mod.row = mod.breakrow;
            mod.flags &= 0xe1;
            mod.flags |= 2;
          }
        }
        mod.tick = 0;
      } else {
        mod.row++;
        mod.tick = 0;
        mod.flags |= 2;
      }
    }
  }
  if (mod.row >= 64) {
    mod.position++;
    mod.row = 0;
    mod.flags |= 4;
  }
  if (mod.position >= mod.songlen) {
    if (mod.repeat) {
      if (mod.breakrow || mod.patternjump) {
        mod.position = mod.patternjump;
        mod.row = mod.breakrow;
      } else {
        mod.position = 0;
      }
    } else {
      mod.endofsong = true;
      //mod.stop();
    }
    return;
  }
}

// mix an audio buffer with data
function mix(mod: Protracker, bufs: Float32Array[], buflen: number) {
  let f: number;
  let p: number, pp: number, n: number, nn: number;

  const outp = new Float32Array(2);
  for (let s = 0; s < buflen; s++) {
    outp[0] = 0.0;
    outp[1] = 0.0;

    if (!mod.paused && !mod.endofsong && mod.playing) {
      advance(mod);

      let och = 0;
      for (let ch = 0; ch < mod.channels; ch++) {
        // calculate playback position
        p = mod.patterntable[mod.position];
        pp = mod.row * 4 * mod.channels + ch * 4;
        if (mod.flags & 2) {
          // new row
          mod.channel[ch].command = mod.pattern[p][pp + 2] & 0x0f;
          mod.channel[ch].data = mod.pattern[p][pp + 3];

          if (
            !(
              mod.channel[ch].command == 0x0e &&
              (mod.channel[ch].data & 0xf0) == 0xd0
            )
          ) {
            n = ((mod.pattern[p][pp] & 0x0f) << 8) | mod.pattern[p][pp + 1];
            if (n) {
              // noteon, except if command=3 (porta to note)
              if (
                mod.channel[ch].command != 0x03 &&
                mod.channel[ch].command != 0x05
              ) {
                mod.channel[ch].period = n;
                mod.channel[ch].samplepos = 0;
                if (mod.channel[ch].vibratowave > 3)
                  mod.channel[ch].vibratopos = 0;
                mod.channel[ch].flags |= 3; // recalc speed
                mod.channel[ch].noteon = 1;
              }
              // in either case, set the slide to note target
              mod.channel[ch].slideto = n;
            }
            nn =
              (mod.pattern[p][pp + 0] & 0xf0) | (mod.pattern[p][pp + 2] >> 4);
            if (nn) {
              mod.channel[ch].sample = nn - 1;
              mod.channel[ch].volume = mod.sample[nn - 1].volume;
              if (!n && mod.channel[ch].samplepos > mod.sample[nn - 1].length)
                mod.channel[ch].samplepos = 0;
            }
          }
        }
        mod.channel[ch].voiceperiod = mod.channel[ch].period;

        // kill empty samples
        if (!mod.sample[mod.channel[ch].sample].length)
          mod.channel[ch].noteon = 0;

        // effects
        if (mod.flags & 1) {
          if (!mod.tick) {
            // process only on tick 0
            effects_t0[mod.channel[ch].command](mod, ch);
          } else {
            effects_t1[mod.channel[ch].command](mod, ch);
          }
        }

        // recalc note number from period
        if (mod.channel[ch].flags & 2) {
          for (let np = 0; np < mod.baseperiodtable.length; np++)
            if (mod.baseperiodtable[np] >= mod.channel[ch].period)
              mod.channel[ch].note = np;
          mod.channel[ch].semitone = 7;
          if (mod.channel[ch].period >= 120)
            mod.channel[ch].semitone =
              mod.baseperiodtable[mod.channel[ch].note] -
              mod.baseperiodtable[mod.channel[ch].note + 1];
        }

        // recalc sample speed and apply finetune
        if (
          (mod.channel[ch].flags & 1 || mod.flags & 2) &&
          mod.channel[ch].voiceperiod
        )
          mod.channel[ch].samplespeed =
            ((7093789.2 / (mod.channel[ch].voiceperiod * 2)) *
              mod.finetunetable[
                mod.sample[mod.channel[ch].sample].finetune + 8
              ]) /
            mod.samplerate;

        // advance vibrato on each new tick
        if (mod.flags & 1) {
          mod.channel[ch].vibratopos += mod.channel[ch].vibratospeed;
          mod.channel[ch].vibratopos &= 0x3f;
        }

        // mix channel to output
        och = och ^ (ch & 1);
        f = 0.0;
        if (mod.channel[ch].noteon) {
          if (
            mod.sample[mod.channel[ch].sample].length >
            mod.channel[ch].samplepos
          )
            f =
              (mod.sample[mod.channel[ch].sample].data[
                Math.floor(mod.channel[ch].samplepos)
              ] *
                mod.channel[ch].volume) /
              64.0;
          outp[och] += f;
          mod.channel[ch].samplepos += mod.channel[ch].samplespeed;
        }
        mod.chvu[ch] = Math.max(mod.chvu[ch], Math.abs(f));

        // loop or end samples
        if (mod.channel[ch].noteon) {
          if (
            mod.sample[mod.channel[ch].sample].loopstart ||
            mod.sample[mod.channel[ch].sample].looplength
          ) {
            if (
              mod.channel[ch].samplepos >=
              mod.sample[mod.channel[ch].sample].loopstart +
                mod.sample[mod.channel[ch].sample].looplength
            ) {
              mod.channel[ch].samplepos -=
                mod.sample[mod.channel[ch].sample].looplength;
            }
          } else {
            if (
              mod.channel[ch].samplepos >=
              mod.sample[mod.channel[ch].sample].length
            ) {
              mod.channel[ch].noteon = 0;
            }
          }
        }

        // clear channel flags
        mod.channel[ch].flags = 0;
      }
      mod.offset++;
      mod.flags &= 0x70;
    }

    // done - store to output buffer
    bufs[0][s] = outp[0];
    bufs[1][s] = outp[1];
  }
}

//
// tick 0 effect functions
//
const effect_t0_0 = function (mod: Protracker, ch: number) {
  // 0 arpeggio
  mod.channel[ch].arpeggio = mod.channel[ch].data;
};
const effect_t0_1 = function (mod: Protracker, ch: number) {
  // 1 slide up
  if (mod.channel[ch].data) mod.channel[ch].slidespeed = mod.channel[ch].data;
};
const effect_t0_2 = function (mod: Protracker, ch: number) {
  // 2 slide down
  if (mod.channel[ch].data) mod.channel[ch].slidespeed = mod.channel[ch].data;
};
const effect_t0_3 = function (mod: Protracker, ch: number) {
  // 3 slide to note
  if (mod.channel[ch].data) mod.channel[ch].slidetospeed = mod.channel[ch].data;
};
const effect_t0_4 = function (mod: Protracker, ch: number) {
  // 4 vibrato
  if (mod.channel[ch].data & 0x0f && mod.channel[ch].data & 0xf0) {
    mod.channel[ch].vibratodepth = mod.channel[ch].data & 0x0f;
    mod.channel[ch].vibratospeed = (mod.channel[ch].data & 0xf0) >> 4;
  }
  effects_t1[4](mod, ch);
};
const effect_t0_5 = function (mod: Protracker, ch: number) {
  // 5
};
const effect_t0_6 = function (mod: Protracker, ch: number) {
  // 6
};
const effect_t0_7 = function (mod: Protracker, ch: number) {
  // 7
};
const effect_t0_8 = function (mod: Protracker, ch: number) {
  // 8 unused, used for syncing
  mod.syncqueue.unshift(mod.channel[ch].data & 0x0f);
};
const effect_t0_9 = function (mod: Protracker, ch: number) {
  // 9 set sample offset
  mod.channel[ch].samplepos = mod.channel[ch].data * 256;
};
const effect_t0_a = function (mod: Protracker, ch: number) {
  // a
};
const effect_t0_b = function (mod: Protracker, ch: number) {
  // b pattern jump
  mod.breakrow = 0;
  mod.patternjump = mod.channel[ch].data;
  mod.flags |= 16;
};
const effect_t0_c = function (mod: Protracker, ch: number) {
  // c set volume
  mod.channel[ch].volume = mod.channel[ch].data;
};
const effect_t0_d = function (mod: Protracker, ch: number) {
  // d pattern break
  mod.breakrow =
    ((mod.channel[ch].data & 0xf0) >> 4) * 10 + (mod.channel[ch].data & 0x0f);
  if (!(mod.flags & 16)) mod.patternjump = mod.position + 1;
  mod.flags |= 16;
};
const effect_t0_e = function (mod: Protracker, ch: number) {
  // e
  const i = (mod.channel[ch].data & 0xf0) >> 4;
  effects_t0_e[i](mod, ch);
};
const effect_t0_f = function (mod: Protracker, ch: number) {
  // f set speed
  if (mod.channel[ch].data > 32) {
    mod.bpm = mod.channel[ch].data;
  } else {
    if (mod.channel[ch].data) mod.speed = mod.channel[ch].data;
  }
};

//
// tick 0 effect e functions
//
const effect_t0_e0 = function (mod: Protracker, ch: number) {
  // e0 filter on/off
  if (mod.channels > 4) return; // use only for 4ch amiga tunes
  if (mod.channel[ch].data & 0x01) {
    mod.filter = false;
  } else {
    mod.filter = true;
  }
};
const effect_t0_e1 = function (mod: Protracker, ch: number) {
  // e1 fine slide up
  mod.channel[ch].period -= mod.channel[ch].data & 0x0f;
  if (mod.channel[ch].period < 113) mod.channel[ch].period = 113;
};
const effect_t0_e2 = function (mod: Protracker, ch: number) {
  // e2 fine slide down
  mod.channel[ch].period += mod.channel[ch].data & 0x0f;
  if (mod.channel[ch].period > 856) mod.channel[ch].period = 856;
  mod.channel[ch].flags |= 1;
};
const effect_t0_e3 = function (mod: Protracker, ch: number) {
  // e3 set glissando
};
const effect_t0_e4 = function (mod: Protracker, ch: number) {
  // e4 set vibrato waveform
  mod.channel[ch].vibratowave = mod.channel[ch].data & 0x07;
};
const effect_t0_e5 = function (mod: Protracker, ch: number) {
  // e5 set finetune
};
const effect_t0_e6 = function (mod: Protracker, ch: number) {
  // e6 loop pattern
  if (mod.channel[ch].data & 0x0f) {
    if (mod.loopcount) {
      mod.loopcount--;
    } else {
      mod.loopcount = mod.channel[ch].data & 0x0f;
    }
    if (mod.loopcount) mod.flags |= 64;
  } else {
    mod.looprow = mod.row;
  }
};
const effect_t0_e7 = function (mod: Protracker, ch: number) {
  // e7
};
const effect_t0_e8 = function (mod: Protracker, ch: number) {
  // e8, use for syncing
  mod.syncqueue.unshift(mod.channel[ch].data & 0x0f);
};
const effect_t0_e9 = function (mod: Protracker, ch: number) {
  // e9
};
const effect_t0_ea = function (mod: Protracker, ch: number) {
  // ea fine volslide up
  mod.channel[ch].volume += mod.channel[ch].data & 0x0f;
  if (mod.channel[ch].volume > 64) mod.channel[ch].volume = 64;
};
const effect_t0_eb = function (mod: Protracker, ch: number) {
  // eb fine volslide down
  mod.channel[ch].volume -= mod.channel[ch].data & 0x0f;
  if (mod.channel[ch].volume < 0) mod.channel[ch].volume = 0;
};
const effect_t0_ec = function (mod: Protracker, ch: number) {
  // ec
};
const effect_t0_ed = function (mod: Protracker, ch: number) {
  // ed delay sample
  if (mod.tick == (mod.channel[ch].data & 0x0f)) {
    // start note
    const p = mod.patterntable[mod.position];
    const pp = mod.row * 4 * mod.channels + ch * 4;
    let n = ((mod.pattern[p][pp] & 0x0f) << 8) | mod.pattern[p][pp + 1];
    if (n) {
      mod.channel[ch].period = n;
      mod.channel[ch].voiceperiod = mod.channel[ch].period;
      mod.channel[ch].samplepos = 0;
      if (mod.channel[ch].vibratowave > 3) mod.channel[ch].vibratopos = 0;
      mod.channel[ch].flags |= 3; // recalc speed
      mod.channel[ch].noteon = 1;
    }
    n = (mod.pattern[p][pp + 0] & 0xf0) | (mod.pattern[p][pp + 2] >> 4);
    if (n) {
      mod.channel[ch].sample = n - 1;
      mod.channel[ch].volume = mod.sample[n - 1].volume;
    }
  }
};
const effect_t0_ee = function (mod: Protracker, ch: number) {
  // ee delay pattern
  mod.patterndelay = mod.channel[ch].data & 0x0f;
  mod.patternwait = 0;
};
const effect_t0_ef = function (mod: Protracker, ch: number) {
  // ef
};

//
// tick 1+ effect functions
//
const effect_t1_0 = function (mod: Protracker, ch: number) {
  // 0 arpeggio
  if (mod.channel[ch].data) {
    let apn = mod.channel[ch].note;
    if (mod.tick % 3 == 1) apn += mod.channel[ch].arpeggio >> 4;
    if (mod.tick % 3 == 2) apn += mod.channel[ch].arpeggio & 0x0f;
    if (apn >= 0 && apn <= mod.baseperiodtable.length)
      mod.channel[ch].voiceperiod = mod.baseperiodtable[apn];
    mod.channel[ch].flags |= 1;
  }
};
const effect_t1_1 = function (mod: Protracker, ch: number) {
  // 1 slide up
  mod.channel[ch].period -= mod.channel[ch].slidespeed;
  if (mod.channel[ch].period < 113) mod.channel[ch].period = 113;
  mod.channel[ch].flags |= 3; // recalc speed
};
const effect_t1_2 = function (mod: Protracker, ch: number) {
  // 2 slide down
  mod.channel[ch].period += mod.channel[ch].slidespeed;
  if (mod.channel[ch].period > 856) mod.channel[ch].period = 856;
  mod.channel[ch].flags |= 3; // recalc speed
};
const effect_t1_3 = function (mod: Protracker, ch: number) {
  // 3 slide to note
  if (mod.channel[ch].period < mod.channel[ch].slideto) {
    mod.channel[ch].period += mod.channel[ch].slidetospeed;
    if (mod.channel[ch].period > mod.channel[ch].slideto)
      mod.channel[ch].period = mod.channel[ch].slideto;
  }
  if (mod.channel[ch].period > mod.channel[ch].slideto) {
    mod.channel[ch].period -= mod.channel[ch].slidetospeed;
    if (mod.channel[ch].period < mod.channel[ch].slideto)
      mod.channel[ch].period = mod.channel[ch].slideto;
  }
  mod.channel[ch].flags |= 3; // recalc speed
};
const effect_t1_4 = function (mod: Protracker, ch: number) {
  // 4 vibrato
  const waveform =
    mod.vibratotable[mod.channel[ch].vibratowave & 3][
      mod.channel[ch].vibratopos
    ] / 63.0; //127.0;

  // two different implementations for vibrato
  //  var a=(mod.channel[ch].vibratodepth/32)*mod.channel[ch].semitone*waveform; // non-linear vibrato +/- semitone
  const a = mod.channel[ch].vibratodepth * waveform; // linear vibrato, depth has more effect high notes

  mod.channel[ch].voiceperiod += a;
  mod.channel[ch].flags |= 1;
};
const effect_t1_5 = function (mod: Protracker, ch: number) {
  // 5 volslide + slide to note
  effect_t1_3(mod, ch); // slide to note
  effect_t1_a(mod, ch); // volslide
};
const effect_t1_6 = function (mod: Protracker, ch: number) {
  // 6 volslide + vibrato
  effect_t1_4(mod, ch); // vibrato
  effect_t1_a(mod, ch); // volslide
};
const effect_t1_7 = function (mod: Protracker, ch: number) {
  // 7
};
const effect_t1_8 = function (mod: Protracker, ch: number) {
  // 8 unused
};
const effect_t1_9 = function (mod: Protracker, ch: number) {
  // 9 set sample offset
};
const effect_t1_a = function (mod: Protracker, ch: number) {
  // a volume slide
  if (!(mod.channel[ch].data & 0x0f)) {
    // y is zero, slide up
    mod.channel[ch].volume += mod.channel[ch].data >> 4;
    if (mod.channel[ch].volume > 64) mod.channel[ch].volume = 64;
  }
  if (!(mod.channel[ch].data & 0xf0)) {
    // x is zero, slide down
    mod.channel[ch].volume -= mod.channel[ch].data & 0x0f;
    if (mod.channel[ch].volume < 0) mod.channel[ch].volume = 0;
  }
};
const effect_t1_b = function (mod: Protracker, ch: number) {
  // b pattern jump
};
const effect_t1_c = function (mod: Protracker, ch: number) {
  // c set volume
};
const effect_t1_d = function (mod: Protracker, ch: number) {
  // d pattern break
};
const effect_t1_e = function (mod: Protracker, ch: number) {
  // e
  const i = (mod.channel[ch].data & 0xf0) >> 4;
  effects_t1_e[i](mod, ch);
};
const effect_t1_f = function (mod: Protracker, ch: number) {
  // f
};

//
// tick 1+ effect e functions
//
const effect_t1_e0 = function (mod: Protracker, ch: number) {
  // e0
};
const effect_t1_e1 = function (mod: Protracker, ch: number) {
  // e1
};
const effect_t1_e2 = function (mod: Protracker, ch: number) {
  // e2
};
const effect_t1_e3 = function (mod: Protracker, ch: number) {
  // e3
};
const effect_t1_e4 = function (mod: Protracker, ch: number) {
  // e4
};
const effect_t1_e5 = function (mod: Protracker, ch: number) {
  // e5
};
const effect_t1_e6 = function (mod: Protracker, ch: number) {
  // e6
};
const effect_t1_e7 = function (mod: Protracker, ch: number) {
  // e7
};
const effect_t1_e8 = function (mod: Protracker, ch: number) {
  // e8
};
const effect_t1_e9 = function (mod: Protracker, ch: number) {
  // e9 retrig sample
  if (mod.tick % (mod.channel[ch].data & 0x0f) == 0)
    mod.channel[ch].samplepos = 0;
};
const effect_t1_ea = function (mod: Protracker, ch: number) {
  // ea
};
const effect_t1_eb = function (mod: Protracker, ch: number) {
  // eb
};
const effect_t1_ec = function (mod: Protracker, ch: number) {
  // ec cut sample
  if (mod.tick == (mod.channel[ch].data & 0x0f)) mod.channel[ch].volume = 0;
};
const effect_t1_ed = function (mod: Protracker, ch: number) {
  // ed delay sample
  effect_t0_ed(mod, ch);
};
const effect_t1_ee = function (mod: Protracker, ch: number) {
  // ee
};
const effect_t1_ef = function (mod: Protracker, ch: number) {
  // ef
};

// effect jumptables
const effects_t0 = [
  effect_t0_0,
  effect_t0_1,
  effect_t0_2,
  effect_t0_3,
  effect_t0_4,
  effect_t0_5,
  effect_t0_6,
  effect_t0_7,
  effect_t0_8,
  effect_t0_9,
  effect_t0_a,
  effect_t0_b,
  effect_t0_c,
  effect_t0_d,
  effect_t0_e,
  effect_t0_f,
];
const effects_t0_e = [
  effect_t0_e0,
  effect_t0_e1,
  effect_t0_e2,
  effect_t0_e3,
  effect_t0_e4,
  effect_t0_e5,
  effect_t0_e6,
  effect_t0_e7,
  effect_t0_e8,
  effect_t0_e9,
  effect_t0_ea,
  effect_t0_eb,
  effect_t0_ec,
  effect_t0_ed,
  effect_t0_ee,
  effect_t0_ef,
];
const effects_t1 = [
  effect_t1_0,
  effect_t1_1,
  effect_t1_2,
  effect_t1_3,
  effect_t1_4,
  effect_t1_5,
  effect_t1_6,
  effect_t1_7,
  effect_t1_8,
  effect_t1_9,
  effect_t1_a,
  effect_t1_b,
  effect_t1_c,
  effect_t1_d,
  effect_t1_e,
  effect_t1_f,
];
const effects_t1_e = [
  effect_t1_e0,
  effect_t1_e1,
  effect_t1_e2,
  effect_t1_e3,
  effect_t1_e4,
  effect_t1_e5,
  effect_t1_e6,
  effect_t1_e7,
  effect_t1_e8,
  effect_t1_e9,
  effect_t1_ea,
  effect_t1_eb,
  effect_t1_ec,
  effect_t1_ed,
  effect_t1_ee,
  effect_t1_ef,
];
